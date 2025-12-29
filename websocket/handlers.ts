import type { ServerWebSocket } from "bun";
import {
	matchPlayers,
	connections,
	lobbySubscribers,
	matchTimelines,
	matchClipIdMaps,
	matchConfigs,
	matchPlayerClipCounts,
	matchPlayerInfos,
	chatRateLimits,
	WS_API_KEY,
	ZONE_BUFFER,
	CHAT_RATE_LIMIT_WINDOW,
	CHAT_RATE_LIMIT_MAX_MESSAGES,
	CHAT_COOLDOWN_MS,
	type WebSocketData,
	type TimelineClip,
	type MatchConfigCache,
	type PlayerInfoCache,
} from "./state";
import {
	type WSMessage,
	MediaType,
	TrackType,
	serializeMessage,
	createLeaveMatchMessage,
	createPlayerJoinedMessage,
	createPlayerLeftMessage,
	createPlayerCountMessage,
	createLobbiesUpdateMessage,
	createErrorMessage,
	createZoneClipsMessage,
	createClipIdMappingMessage,
	createChatBroadcast,
	toLobbyInfoProto,
	createTrackProto,
	createClipDataProto,
	applyClipDelta,
} from "./types";
import { getShortClipId, getFullClipId, removeClipIdMapping } from "./clipIdMapping";
import {
	updateCacheClipAdded,
	updateCacheClipUpdated,
	updateCacheClipRemoved,
	updateCacheClipSplit,
	cleanupMatchResources,
} from "./timelineCache";
import { broadcast, broadcastClipMessage, requestTimelineSync } from "./broadcast";
import {
	validateClipConstraints,
	validateClipUpdate,
	validateClipSplit,
	validatePlayerClipLimit,
	type ClipForValidation,
	type TimelineForValidation,
} from "../lib/clipConstraints";

export async function fetchLobbies() {
	try {
		const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
		const [waitingRes, inMatchRes] = await Promise.all([
			fetch(`${apiUrl}/api/lobbies?status=waiting`),
			fetch(`${apiUrl}/api/lobbies?status=in_match`),
		]);

		const lobbies: {
			id: string;
			name: string;
			joinCode: string;
			hostUsername: string;
			playerCount: number;
			maxPlayers: number;
			status: string;
			isSystemLobby: boolean;
			createdAt: string;
			players: { id: string; username: string; image?: string | null }[];
			matchConfig: {
				timelineDuration: number;
				matchDuration: number;
				maxPlayers: number;
				audioMaxDb: number;
				clipSizeMin: number;
				clipSizeMax: number;
				maxVideoTracks: number;
				maxAudioTracks: number;
				maxClipsPerUser: number;
				constraints: string[];
			};
			matchEndsAt?: string | null;
		}[] = [];

		if (waitingRes.ok) {
			const data = await waitingRes.json();
			lobbies.push(
				...data.lobbies.map((lobby: any) => ({
					id: lobby.id,
					name: lobby.name,
					joinCode: lobby.joinCode,
					hostUsername: lobby.hostUsername,
					playerCount: lobby.playerCount,
					maxPlayers: lobby.maxPlayers,
					status: lobby.status,
					isSystemLobby: lobby.isSystemLobby ?? false,
					createdAt: lobby.createdAt,
					players: lobby.players ?? [],
					matchConfig: lobby.matchConfig,
					matchEndsAt: lobby.matchEndsAt ?? null,
				}))
			);
		}

		if (inMatchRes.ok) {
			const data = await inMatchRes.json();
			lobbies.push(
				...data.lobbies.map((lobby: any) => ({
					id: lobby.id,
					name: lobby.name,
					joinCode: lobby.joinCode,
					hostUsername: lobby.hostUsername,
					playerCount: lobby.playerCount,
					maxPlayers: lobby.maxPlayers,
					status: lobby.status,
					isSystemLobby: lobby.isSystemLobby ?? false,
					createdAt: lobby.createdAt,
					players: lobby.players ?? [],
					matchConfig: lobby.matchConfig,
					matchEndsAt: lobby.matchEndsAt ?? null,
				}))
			);
		}

		return lobbies;
	} catch (error) {
		console.error("[WS] Failed to fetch lobbies:", error);
		return [];
	}
}

async function fetchMatchConfig(matchId: string): Promise<MatchConfigCache | null> {
	const cached = matchConfigs.get(matchId);
	if (cached) return cached;

	try {
		const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
		const response = await fetch(`${apiUrl}/api/matches/${matchId}`);
		if (!response.ok) return null;

		const data = await response.json();
		const config = data.match?.config;
		if (!config) return null;

		const configCache: MatchConfigCache = {
			timelineDuration: config.timelineDuration ?? 30,
			clipSizeMin: config.clipSizeMin ?? 0.5,
			clipSizeMax: config.clipSizeMax ?? 10,
			audioMaxDb: config.audioMaxDb ?? 6,
			maxVideoTracks: config.maxVideoTracks ?? 20,
			maxAudioTracks: config.maxAudioTracks ?? 20,
			maxClipsPerUser: config.maxClipsPerUser ?? 10,
			constraints: config.constraints ?? [],
		};

		matchConfigs.set(matchId, configCache);
		return configCache;
	} catch (error) {
		console.error(`[WS] Failed to fetch match config for ${matchId}:`, error);
		return null;
	}
}

function getTimelineForValidation(matchId: string): TimelineForValidation {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) {
		return { duration: 30, tracks: [] };
	}
	return {
		duration: timeline.duration,
		tracks: timeline.tracks.map((track) => ({
			id: track.id,
			type: track.type,
			clips: track.clips.map((clip) => ({
				id: clip.id,
				type: clip.type,
				startTime: clip.startTime,
				duration: clip.duration,
				properties: clip.properties as { volume?: number; [key: string]: unknown },
			})),
		})),
	};
}

function getPlayerClipCount(matchId: string, userId: string): number {
	const playerCounts = matchPlayerClipCounts.get(matchId);
	if (!playerCounts) return 0;
	return playerCounts.get(userId) ?? 0;
}

function incrementPlayerClipCount(matchId: string, userId: string): void {
	if (!matchPlayerClipCounts.has(matchId)) {
		matchPlayerClipCounts.set(matchId, new Map());
	}
	const playerCounts = matchPlayerClipCounts.get(matchId)!;
	const current = playerCounts.get(userId) ?? 0;
	playerCounts.set(userId, current + 1);
}

function decrementPlayerClipCount(matchId: string, userId: string): void {
	const playerCounts = matchPlayerClipCounts.get(matchId);
	if (!playerCounts) return;
	const current = playerCounts.get(userId) ?? 0;
	if (current > 0) {
		playerCounts.set(userId, current - 1);
	}
}

export function handleSubscribeLobbies(ws: ServerWebSocket<WebSocketData>): void {
	ws.data.subscribedToLobbies = true;
	lobbySubscribers.add(ws.data.id);
	console.log(`[WS] Connection ${ws.data.id} subscribed to lobbies`);

	fetchLobbies().then((lobbies) => {
		if (ws.readyState === 1) {
			const protoLobbies = lobbies.map(toLobbyInfoProto);
			ws.send(serializeMessage(createLobbiesUpdateMessage(protoLobbies)));
		}
	});
}

export function handleUnsubscribeLobbies(ws: ServerWebSocket<WebSocketData>): void {
	ws.data.subscribedToLobbies = false;
	lobbySubscribers.delete(ws.data.id);
	console.log(`[WS] Connection ${ws.data.id} unsubscribed from lobbies`);
}

export async function handleJoinMatch(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): Promise<void> {
	if (msg.payload.case !== "joinMatch" || !msg.payload.value) return;
	const { matchId, userId, username, userImage, highlightColor } = msg.payload.value;

	if (ws.data.matchId) {
		handleLeaveMatch(ws, createLeaveMatchMessage(ws.data.matchId, ws.data.userId!));
	}

	ws.data.matchId = matchId;
	ws.data.userId = userId;
	ws.data.username = username;
	ws.data.userImage = userImage ?? null;
	ws.data.highlightColor = highlightColor || "#3b82f6";

	ws.subscribe(`match:${matchId}`);

	if (!matchPlayers.has(matchId)) {
		matchPlayers.set(matchId, new Set());
	}
	matchPlayers.get(matchId)!.add(ws.data.id);

	await fetchMatchConfig(matchId);

	const playerCount = matchPlayers.get(matchId)!.size;
	ws.send(serializeMessage(createPlayerCountMessage(matchId, playerCount)));

	broadcast(matchId, createPlayerJoinedMessage(matchId, { userId, username }), ws.data.id);
}

export function handleLeaveMatch(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): void {
	if (msg.payload.case !== "leaveMatch" || !msg.payload.value) return;
	const { matchId, userId } = msg.payload.value;

	ws.unsubscribe(`match:${matchId}`);

	const players = matchPlayers.get(matchId);
	if (players) {
		players.delete(ws.data.id);
		if (players.size === 0) {
			matchPlayers.delete(matchId);
			cleanupMatchResources(matchId);
		}
	}

	broadcast(matchId, createPlayerLeftMessage(matchId, userId));

	ws.data.matchId = null;
	ws.data.userId = null;
	ws.data.username = null;

	console.log(`[WS] Player ${userId} left match ${matchId}`);
}

export function handleMediaUploaded(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): void {
	if (msg.payload.case !== "mediaUploaded" || !msg.payload.value) return;
	const { matchId } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	broadcast(matchId, msg, ws.data.id);
}

export function handleMediaRemoved(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): void {
	if (msg.payload.case !== "mediaRemoved" || !msg.payload.value) return;
	const { matchId, mediaId } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	broadcast(matchId, msg, ws.data.id);
	console.log(`[WS] Media removed in match ${matchId}: ${mediaId}`);
}

const mediaTypeMap: Record<number, "video" | "audio" | "image"> = { 1: "video", 2: "audio", 3: "image" };

export async function handleClipAdded(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): Promise<void> {
	if (msg.payload.case !== "clipAdded" || !msg.payload.value) return;
	const { matchId, trackId, clip, addedBy } = msg.payload.value;
	const userId = addedBy?.userId || ws.data.userId;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	if (!clip || clip.startTime === undefined || clip.duration === undefined) {
		console.warn(`[WS] clipAdded missing clip timing data for match ${matchId}, will broadcast to all clients`);
	}

	if (clip) {
		const timeline = matchTimelines.get(matchId);
		if (timeline) {
			const track = timeline.tracks.find((t) => t.id === trackId);
			if (track) {
				const clipType = mediaTypeMap[clip.type] || "video";
				const isVideoClip = clipType === "video" || clipType === "image";
				const isAudioClip = clipType === "audio";
				
				if ((track.type === "video" && isAudioClip) || (track.type === "audio" && isVideoClip)) {
					ws.send(serializeMessage(createErrorMessage("TRACK_TYPE_MISMATCH", `Cannot place ${clipType} clip on ${track.type} track`)));
					return;
				}
			}
		}
	}

	const config = await fetchMatchConfig(matchId);
	if (config && clip) {
		if (userId) {
			const playerClipCount = getPlayerClipCount(matchId, userId);
			const limitResult = validatePlayerClipLimit(config, playerClipCount);
			if (!limitResult.valid) {
				ws.send(serializeMessage(createErrorMessage("CONSTRAINT_VIOLATION", limitResult.reason || "Clip limit reached")));
				return;
			}
		}

		const clipForValidation: ClipForValidation = {
			id: clip.id,
			type: mediaTypeMap[clip.type] || "video",
			startTime: clip.startTime,
			duration: clip.duration,
			properties: clip.properties ? { volume: clip.properties.volume } : undefined,
		};

		const timeline = getTimelineForValidation(matchId);
		const validationResult = validateClipConstraints(clipForValidation, config, timeline, trackId);

		if (!validationResult.valid) {
			ws.send(serializeMessage(createErrorMessage("CONSTRAINT_VIOLATION", validationResult.reason || "Invalid clip")));
			return;
		}
	}

	if (clip) {
		updateCacheClipAdded(matchId, trackId, {
			id: clip.id,
			type: mediaTypeMap[clip.type] || "video",
			name: clip.name,
			src: clip.src,
			startTime: clip.startTime,
			duration: clip.duration,
			sourceIn: clip.sourceIn,
			sourceDuration: clip.sourceDuration,
			thumbnail: clip.thumbnail,
			properties: clip.properties ? ({ ...clip.properties } as Record<string, unknown>) : {},
		});

		const clipType = mediaTypeMap[clip.type] || "video";
		const shortId = getShortClipId(matchId, clip.id, trackId);

		const idMappingBytes = serializeMessage(createClipIdMappingMessage(matchId, [{ shortId, fullId: clip.id, trackId, clipType }]));
		const players = matchPlayers.get(matchId);
		if (players) {
			for (const connId of players) {
				const playerWs = connections.get(connId);
				if (playerWs && playerWs.readyState === 1) {
					playerWs.send(idMappingBytes);
				}
			}
		}

		if (userId) {
			incrementPlayerClipCount(matchId, userId);
		}
	}

	const clipStartTime = clip?.startTime;
	const clipDuration = clip?.duration;
	broadcastClipMessage(matchId, msg, clipStartTime, clipDuration, ws.data.id);

	requestTimelineSync(matchId);
}

export async function handleClipUpdated(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): Promise<void> {
	if (msg.payload.case !== "clipUpdated" || !msg.payload.value) return;
	const { matchId, trackId, clipId, updates } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	const config = await fetchMatchConfig(matchId);
	if (config && updates) {
		const updateForValidation: Partial<ClipForValidation> = {
			...(updates.startTime !== undefined && { startTime: updates.startTime }),
			...(updates.duration !== undefined && { duration: updates.duration }),
			...(updates.type && { type: mediaTypeMap[updates.type] || "video" }),
			...(updates.properties && { properties: { volume: updates.properties.volume } }),
		};

		const timeline = getTimelineForValidation(matchId);
		const validationResult = validateClipUpdate(clipId, updateForValidation, config, timeline, trackId);

		if (!validationResult.valid) {
			ws.send(serializeMessage(createErrorMessage("CONSTRAINT_VIOLATION", validationResult.reason || "Invalid clip update")));
			return;
		}
	}

	if (updates) {
		updateCacheClipUpdated(matchId, trackId, clipId, {
			...(updates.id && { id: updates.id }),
			...(updates.type && { type: mediaTypeMap[updates.type] || "video" }),
			...(updates.name && { name: updates.name }),
			...(updates.src && { src: updates.src }),
			...(updates.startTime !== undefined && { startTime: updates.startTime }),
			...(updates.duration !== undefined && { duration: updates.duration }),
			...(updates.sourceIn !== undefined && { sourceIn: updates.sourceIn }),
			...(updates.sourceDuration !== undefined && { sourceDuration: updates.sourceDuration }),
			...(updates.thumbnail && { thumbnail: updates.thumbnail }),
			...(updates.properties && { properties: { ...updates.properties } as Record<string, unknown> }),
		});
	}

	broadcast(matchId, msg, ws.data.id);
	requestTimelineSync(matchId);
}

export function handleClipRemoved(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): void {
	if (msg.payload.case !== "clipRemoved" || !msg.payload.value) return;
	const { matchId, trackId, clipId, removedBy } = msg.payload.value;
	const userId = removedBy?.userId || ws.data.userId;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	updateCacheClipRemoved(matchId, trackId, clipId);
	removeClipIdMapping(matchId, clipId);

	if (userId) {
		decrementPlayerClipCount(matchId, userId);
	}

	broadcast(matchId, msg, ws.data.id);
	requestTimelineSync(matchId);
}

export async function handleClipBatchUpdate(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): Promise<void> {
	if (msg.payload.case !== "clipBatchUpdate" || !msg.payload.value) return;
	const { matchId, updates } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	if (!updates || updates.length === 0) return;

	const config = await fetchMatchConfig(matchId);
	const timeline = getTimelineForValidation(matchId);

	for (const delta of updates) {
		const clipInfo = getFullClipId(matchId, delta.shortId);
		if (!clipInfo) {
			console.warn(`[WS] Unknown short clip ID ${delta.shortId} in batch update for match ${matchId}`);
			continue;
		}

		const { fullId: clipId, trackId } = clipInfo;

		if (config) {
			const updateForValidation: Partial<ClipForValidation> = {
				...(delta.startTime !== undefined && { startTime: delta.startTime }),
				...(delta.duration !== undefined && { duration: delta.duration }),
				...(delta.properties && { properties: { volume: delta.properties.volume } }),
			};

			const validationResult = validateClipUpdate(clipId, updateForValidation, config, timeline, delta.newTrackId || trackId);
			if (!validationResult.valid) {
				ws.send(serializeMessage(createErrorMessage("CONSTRAINT_VIOLATION", validationResult.reason || "Invalid clip update")));
				console.log(`[WS] Batch update rejected in match ${matchId}: ${validationResult.reason}`);
				return;
			}
		}

		const cachedTimeline = matchTimelines.get(matchId);
		if (cachedTimeline) {
			for (const track of cachedTimeline.tracks) {
				const clip = track.clips.find((c) => c.id === clipId);
				if (clip) {
					applyClipDelta(clip, delta);
					break;
				}
			}
		}
	}

	broadcastClipMessage(matchId, msg, undefined, undefined, ws.data.id);
	requestTimelineSync(matchId);
}

export async function handleClipSplit(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): Promise<void> {
	if (msg.payload.case !== "clipSplit" || !msg.payload.value) return;
	const { matchId, trackId, originalClip, newClip, splitBy } = msg.payload.value;
	const userId = splitBy?.userId || ws.data.userId;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	if (!originalClip || !newClip) {
		ws.send(serializeMessage(createErrorMessage("INVALID_PAYLOAD", "Missing clip data in split message")));
		return;
	}

	const config = await fetchMatchConfig(matchId);
	if (config) {
		if (userId) {
			const playerClipCount = getPlayerClipCount(matchId, userId);
			const limitResult = validatePlayerClipLimit(config, playerClipCount);
			if (!limitResult.valid) {
				ws.send(serializeMessage(createErrorMessage("CONSTRAINT_VIOLATION", limitResult.reason || "Clip limit reached")));
				return;
			}
		}

		const originalForValidation: ClipForValidation = {
			id: originalClip.id,
			type: mediaTypeMap[originalClip.type] || "video",
			startTime: originalClip.startTime,
			duration: originalClip.duration,
			properties: originalClip.properties ? { volume: originalClip.properties.volume } : undefined,
		};

		const newForValidation: ClipForValidation = {
			id: newClip.id,
			type: mediaTypeMap[newClip.type] || "video",
			startTime: newClip.startTime,
			duration: newClip.duration,
			properties: newClip.properties ? { volume: newClip.properties.volume } : undefined,
		};

		const timeline = getTimelineForValidation(matchId);
		const validationResult = validateClipSplit(originalForValidation, newForValidation, config, timeline, trackId);

		if (!validationResult.valid) {
			ws.send(serializeMessage(createErrorMessage("CONSTRAINT_VIOLATION", validationResult.reason || "Invalid split")));
			return;
		}
	}

	updateCacheClipSplit(
		matchId,
		trackId,
		{
			id: originalClip.id,
			type: mediaTypeMap[originalClip.type] || "video",
			name: originalClip.name,
			src: originalClip.src,
			startTime: originalClip.startTime,
			duration: originalClip.duration,
			sourceIn: originalClip.sourceIn,
			sourceDuration: originalClip.sourceDuration,
			thumbnail: originalClip.thumbnail,
			properties: originalClip.properties ? ({ ...originalClip.properties } as Record<string, unknown>) : {},
		},
		{
			id: newClip.id,
			type: mediaTypeMap[newClip.type] || "video",
			name: newClip.name,
			src: newClip.src,
			startTime: newClip.startTime,
			duration: newClip.duration,
			sourceIn: newClip.sourceIn,
			sourceDuration: newClip.sourceDuration,
			thumbnail: newClip.thumbnail,
			properties: newClip.properties ? ({ ...newClip.properties } as Record<string, unknown>) : {},
		}
	);

	if (userId) {
		incrementPlayerClipCount(matchId, userId);
	}

	const splitSpanDuration = newClip.startTime + newClip.duration - originalClip.startTime;
	broadcastClipMessage(matchId, msg, originalClip.startTime, splitSpanDuration, ws.data.id);

	requestTimelineSync(matchId);
}

export async function handleTimelineSync(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): Promise<void> {
	if (msg.payload.case !== "timelineSync" || !msg.payload.value) return;
	const { matchId, timeline } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	const timelineJson = timeline
		? {
				duration: timeline.duration,
				tracks: timeline.tracks.map((track) => ({
					id: track.id,
					type: (track.type === TrackType.VIDEO ? "video" : "audio") as "video" | "audio",
					clips: track.clips.map((clip) => ({
						id: clip.id,
						type: (clip.type === MediaType.VIDEO ? "video" : clip.type === MediaType.AUDIO ? "audio" : "image") as
							| "video"
							| "audio"
							| "image",
						name: clip.name,
						src: clip.src,
						startTime: clip.startTime,
						duration: clip.duration,
						sourceIn: clip.sourceIn,
						sourceDuration: clip.sourceDuration,
						thumbnail: clip.thumbnail,
						properties: clip.properties
							? {
									x: clip.properties.x,
									y: clip.properties.y,
									width: clip.properties.width,
									height: clip.properties.height,
									opacity: clip.properties.opacity,
									rotation: clip.properties.rotation,
									scale: clip.properties.scale,
									speed: clip.properties.speed,
									flipX: clip.properties.flipX,
									flipY: clip.properties.flipY,
									zoomX: clip.properties.zoomX,
									zoomY: clip.properties.zoomY,
									zoomLinked: clip.properties.zoomLinked,
									freezeFrame: clip.properties.freezeFrame,
									freezeFrameTime: clip.properties.freezeFrameTime,
									volume: clip.properties.volume,
									pan: clip.properties.pan,
									pitch: clip.properties.pitch,
									cropTop: clip.properties.cropTop,
									cropBottom: clip.properties.cropBottom,
									cropLeft: clip.properties.cropLeft,
									cropRight: clip.properties.cropRight,
							  }
							: {},
					})),
				})),
		  }
		: null;

	if (timelineJson) {
		matchTimelines.set(matchId, timelineJson);
	}

	try {
		const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
		const response = await fetch(`${apiUrl}/api/matches/${matchId}`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${WS_API_KEY}`,
			},
			body: JSON.stringify({ timeline: timelineJson }),
		});

		if (response.ok) {
			console.log(`[WS] Timeline synced to database for match ${matchId}`);
		} else {
			console.error(`[WS] Failed to sync timeline: ${response.status}`);
		}
	} catch (error) {
		console.error(`[WS] Error syncing timeline:`, error);
	}
}

export function handleClipSelection(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): void {
	if (msg.payload.case !== "clipSelection" || !msg.payload.value) return;
	const { matchId, userId, username, userImage, highlightColor } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	if (userImage !== undefined) {
		ws.data.userImage = userImage ?? null;
	}
	if (highlightColor) {
		ws.data.highlightColor = highlightColor;
	}

	broadcast(matchId, msg, ws.data.id);
}

export function handleZoneSubscribe(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): void {
	if (msg.payload.case !== "zoneSubscribe" || !msg.payload.value) return;
	const { matchId, startTime, endTime } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	ws.data.zone = { startTime, endTime };

	const timeline = matchTimelines.get(matchId);
	if (!timeline) {
		ws.send(serializeMessage(createZoneClipsMessage(matchId, startTime, endTime, [])));
		requestTimelineSync(matchId);
		return;
	}

	const zoneStart = startTime - ZONE_BUFFER;
	const zoneEnd = endTime + ZONE_BUFFER;

	const zoneTracks = timeline.tracks.map((track) => {
		const filteredClips = track.clips.filter((clip) => {
			const clipEnd = clip.startTime + clip.duration;
			return clip.startTime < zoneEnd && clipEnd > zoneStart;
		});
		return createTrackProto({
			id: track.id,
			type: track.type,
			clips: filteredClips.map((clip) =>
				createClipDataProto({
					id: clip.id,
					type: clip.type,
					name: clip.name,
					src: clip.src,
					startTime: clip.startTime,
					duration: clip.duration,
					sourceIn: clip.sourceIn,
					sourceDuration: clip.sourceDuration,
					thumbnail: clip.thumbnail,
					properties: clip.properties,
				})
			),
		});
	});

	ws.send(serializeMessage(createZoneClipsMessage(matchId, startTime, endTime, zoneTracks)));
}

export function handleChatMessage(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): void {
	if (msg.payload.case !== "chatMessage" || !msg.payload.value) return;
	const { matchId, message } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	const userId = ws.data.userId;
	const username = ws.data.username;

	if (!userId || !username) {
		ws.send(serializeMessage(createErrorMessage("NOT_AUTHENTICATED", "User info not available")));
		return;
	}

	const now = Date.now();
	let rateData = chatRateLimits.get(ws.data.id);
	if (!rateData) {
		rateData = { lastMessageTime: 0, messageCount: 0, windowStart: now };
		chatRateLimits.set(ws.data.id, rateData);
	}

	if (now - rateData.windowStart > CHAT_RATE_LIMIT_WINDOW) {
		rateData.windowStart = now;
		rateData.messageCount = 0;
	}

	if (now - rateData.lastMessageTime < CHAT_COOLDOWN_MS) {
		ws.send(serializeMessage(createErrorMessage("RATE_LIMITED", "You're sending messages too fast")));
		return;
	}

	if (rateData.messageCount >= CHAT_RATE_LIMIT_MAX_MESSAGES) {
		const timeLeft = Math.ceil((rateData.windowStart + CHAT_RATE_LIMIT_WINDOW - now) / 1000);
		ws.send(serializeMessage(createErrorMessage("RATE_LIMITED", `Too many messages. Try again in ${timeLeft}s`)));
		return;
	}

	rateData.lastMessageTime = now;
	rateData.messageCount++;

	const sanitizedMessage = message.trim().slice(0, 200);
	if (!sanitizedMessage) return;

	const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	const userImage = ws.data.userImage ?? undefined;
	const highlightColor = ws.data.highlightColor ?? "#3b82f6";
	const timestamp = BigInt(Date.now());

	const broadcastMsg = createChatBroadcast(
		matchId,
		messageId,
		userId,
		username,
		userImage,
		highlightColor,
		sanitizedMessage,
		timestamp
	);

	const players = matchPlayers.get(matchId);
	if (players) {
		const msgBytes = serializeMessage(broadcastMsg);
		for (const connId of players) {
			const playerWs = connections.get(connId);
			if (playerWs && playerWs.readyState === 1) {
				playerWs.send(msgBytes);
			}
		}
	}
}
