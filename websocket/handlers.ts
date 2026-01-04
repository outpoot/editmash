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
	matchEditCounts,
	chatRateLimits,
	userConnections,
	activeVoteKicks,
	matchBannedUsers,
	matchChatHistory,
	MAX_CHAT_HISTORY,
	WS_API_KEY,
	ZONE_BUFFER,
	CHAT_RATE_LIMIT_WINDOW,
	CHAT_RATE_LIMIT_MAX_MESSAGES,
	CHAT_COOLDOWN_MS,
	VOTE_KICK_DURATION_MS,
	VOTE_KICK_THRESHOLD,
	type WebSocketData,
	type TimelineClip,
	type MatchConfigCache,
	type PlayerInfoCache,
	type ActiveVoteKick,
	type StoredChatMessage,
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
import { broadcast, requestTimelineSync } from "./broadcast";
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
		console.log(`[WS] Fetching lobbies from: ${apiUrl}`);
		const [waitingRes, inMatchRes] = await Promise.all([
			fetch(`${apiUrl}/api/lobbies?status=waiting`),
			fetch(`${apiUrl}/api/lobbies?status=in_match`),
		]);
		console.log(`[WS] Response status - waiting: ${waitingRes.status}, inMatch: ${inMatchRes.status}`);

		if (!waitingRes.ok) {
			const errorText = await waitingRes.text();
			console.error(`[WS] Waiting lobbies error (${waitingRes.status}):`, errorText.substring(0, 500));
		}
		if (!inMatchRes.ok) {
			const errorText = await inMatchRes.text();
			console.error(`[WS] In-match lobbies error (${inMatchRes.status}):`, errorText.substring(0, 500));
		}

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
			const text = await waitingRes.text();
			console.log(`[WS] Waiting response: ${text.substring(0, 200)}`);
			try {
				const data = JSON.parse(text);
				console.log(`[WS] Found ${data.lobbies?.length || 0} waiting lobbies`);
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
			} catch (e) {
				console.error(`[WS] Failed to parse waiting lobbies:`, e);
			}
		}

		if (inMatchRes.ok) {
			const text = await inMatchRes.text();
			console.log(`[WS] InMatch response: ${text.substring(0, 200)}`);
			try {
				const data = JSON.parse(text);
				console.log(`[WS] Found ${data.lobbies?.length || 0} in-match lobbies`);
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
			} catch (e) {
				console.error(`[WS] Failed to parse in-match lobbies:`, e);
			}
		}

		console.log(`[WS] Returning ${lobbies.length} total lobbies`);
		return lobbies;
	} catch (error) {
		console.error("[WS] Failed to fetch lobbies:", error);
		return [];
	}
}

export async function notifyPlayerDisconnected(matchId: string, userId: string): Promise<void> {
	try {
		const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
		const response = await fetch(`${apiUrl}/api/matches/${matchId}/leave`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${WS_API_KEY}`,
			},
			body: JSON.stringify({ userId }),
		});

		if (!response.ok) {
			console.warn(`[WS] Failed to notify player disconnect for ${userId} in match ${matchId}: ${response.status}`);
		} else {
			console.log(`[WS] Notified API of player ${userId} disconnect from match ${matchId}`);
		}
	} catch (error) {
		console.error(`[WS] Error notifying player disconnect:`, error);
	}
}

export async function notifyLobbyPlayerDisconnected(lobbyId: string, userId: string): Promise<void> {
	try {
		const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
		const response = await fetch(`${apiUrl}/api/lobbies/${lobbyId}/leave`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${WS_API_KEY}`,
			},
			body: JSON.stringify({ userId }),
		});

		if (!response.ok) {
			console.warn(`[WS] Failed to notify player disconnect for ${userId} in lobby ${lobbyId}: ${response.status}`);
		} else {
			console.log(`[WS] Notified API of player ${userId} disconnect from lobby ${lobbyId}`);
		}
	} catch (error) {
		console.error(`[WS] Error notifying lobby player disconnect:`, error);
	}
}

export function handleJoinLobby(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): void {
	if (msg.payload.case !== "joinLobby" || !msg.payload.value) return;
	const { lobbyId, userId, username } = msg.payload.value;

	ws.data.lobbyId = lobbyId;
	ws.data.userId = userId;
	ws.data.username = username;

	if (!userConnections.has(userId)) {
		userConnections.set(userId, new Set());
	}
	userConnections.get(userId)!.add(ws.data.id);

	console.log(`[WS] Player ${username} (${userId}) joined lobby ${lobbyId}`);
}

export function handleLeaveLobby(ws: ServerWebSocket<WebSocketData>, msg: WSMessage): void {
	if (msg.payload.case !== "leaveLobby" || !msg.payload.value) return;
	const { lobbyId, userId } = msg.payload.value;

	ws.data.lobbyId = null;

	const userConns = userConnections.get(userId);
	if (userConns) {
		userConns.delete(ws.data.id);
		if (userConns.size === 0) {
			userConnections.delete(userId);
		}
	}

	console.log(`[WS] Player ${userId} left lobby ${lobbyId}`);
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

	const bannedUsers = matchBannedUsers.get(matchId);
	if (bannedUsers && bannedUsers.has(userId)) {
		ws.send(serializeMessage(createErrorMessage("VOTE_KICKED", "You have been vote kicked from this match and cannot rejoin.")));
		return;
	}

	if (ws.data.matchId) {
		handleLeaveMatch(ws, createLeaveMatchMessage(ws.data.matchId, ws.data.userId!));
	}

	const existingConnections = userConnections.get(userId);
	if (existingConnections) {
		for (const connId of existingConnections) {
			if (connId === ws.data.id) continue;

			const otherWs = connections.get(connId);

			if (otherWs && otherWs.data.matchId) {
				const otherMatchId = otherWs.data.matchId;
				otherWs.unsubscribe(`match:${otherMatchId}`);
				const players = matchPlayers.get(otherMatchId);
				if (players) {
					players.delete(connId);
					if (players.size === 0) {
						matchPlayers.delete(otherMatchId);
						cleanupMatchResources(otherMatchId);
					}
				}
				if (otherMatchId !== matchId) {
					broadcast(otherMatchId, createPlayerLeftMessage(otherMatchId, userId));
				}
				otherWs.data.matchId = null;
				otherWs.data.userId = null;
				otherWs.data.username = null;
				console.log(`[WS] Force-removed user ${userId} from match ${otherMatchId} (joined ${matchId})`);
			}
		}
	}

	if (!userConnections.has(userId)) {
		userConnections.set(userId, new Set());
	}
	userConnections.get(userId)!.add(ws.data.id);

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

	// record player joining in database (handles late-joiners after match start)
	try {
		const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
		await fetch(`${apiUrl}/api/matches/${matchId}/join`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${WS_API_KEY}`,
			},
			body: JSON.stringify({ userId }),
		});
	} catch (error) {
		console.error(`[WS] Failed to record player join for ${userId} in match ${matchId}:`, error);
	}

	const playerCount = matchPlayers.get(matchId)!.size;
	ws.send(serializeMessage(createPlayerCountMessage(matchId, playerCount)));

	const chatHistory = matchChatHistory.get(matchId);
	if (chatHistory && chatHistory.length > 0) {
		for (const msg of chatHistory) {
			ws.send(
				serializeMessage(
					createChatBroadcast(
						matchId,
						msg.messageId,
						msg.userId,
						msg.username,
						msg.userImage,
						msg.highlightColor,
						msg.message,
						msg.timestamp
					)
				)
			);
		}
	}

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

	const userConns = userConnections.get(userId);
	if (userConns) {
		userConns.delete(ws.data.id);
		if (userConns.size === 0) {
			userConnections.delete(userId);
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

		const currentEditCount = matchEditCounts.get(matchId) ?? 0;
		matchEditCounts.set(matchId, currentEditCount + 1);
	}

	broadcast(matchId, msg, ws.data.id);

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

		const currentEditCount = matchEditCounts.get(matchId) ?? 0;
		matchEditCounts.set(matchId, currentEditCount + 1);
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

	const currentEditCount = matchEditCounts.get(matchId) ?? 0;
	matchEditCounts.set(matchId, currentEditCount + 1);

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

	const currentEditCount = matchEditCounts.get(matchId) ?? 0;
	matchEditCounts.set(matchId, currentEditCount + updates.length);

	broadcast(matchId, msg, ws.data.id);
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

	const currentEditCount = matchEditCounts.get(matchId) ?? 0;
	matchEditCounts.set(matchId, currentEditCount + 1);

	broadcast(matchId, msg, ws.data.id);

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

	const editCount = matchEditCounts.get(matchId) ?? 0;

	try {
		const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
		const response = await fetch(`${apiUrl}/api/matches/${matchId}`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${WS_API_KEY}`,
			},
			body: JSON.stringify({ timeline: timelineJson, editCount }),
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

	if (sanitizedMessage.toLowerCase().startsWith("!kick ")) {
		handleKickCommand(matchId, userId, username, sanitizedMessage.slice(6).trim());
		return;
	}

	const lowerMessage = sanitizedMessage.toLowerCase();
	if (lowerMessage === "y" || lowerMessage === "yes") {
		handleVoteResponse(matchId, userId, username, true);
		return;
	}

	const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	const userImage = ws.data.userImage ?? undefined;
	const highlightColor = ws.data.highlightColor ?? "#3b82f6";
	const timestamp = BigInt(Date.now());

	if (!matchChatHistory.has(matchId)) {
		matchChatHistory.set(matchId, []);
	}
	const history = matchChatHistory.get(matchId)!;
	history.push({
		messageId,
		userId,
		username,
		userImage,
		highlightColor,
		message: sanitizedMessage,
		timestamp,
	});
	if (history.length > MAX_CHAT_HISTORY) {
		history.shift();
	}

	const broadcastMsg = createChatBroadcast(matchId, messageId, userId, username, userImage, highlightColor, sanitizedMessage, timestamp);

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

function broadcastSystemMessage(matchId: string, message: string): void {
	const players = matchPlayers.get(matchId);
	if (!players) return;

	const messageId = `sys_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	const timestamp = BigInt(Date.now());

	if (!matchChatHistory.has(matchId)) {
		matchChatHistory.set(matchId, []);
	}
	const history = matchChatHistory.get(matchId)!;
	history.push({
		messageId,
		userId: "system",
		username: "System",
		userImage: undefined,
		highlightColor: "#f59e0b",
		message,
		timestamp,
	});
	if (history.length > MAX_CHAT_HISTORY) {
		history.shift();
	}

	const systemMsg = createChatBroadcast(matchId, messageId, "system", "System", undefined, "#f59e0b", message, timestamp);

	const msgBytes = serializeMessage(systemMsg);
	for (const connId of players) {
		const playerWs = connections.get(connId);
		if (playerWs && playerWs.readyState === 1) {
			playerWs.send(msgBytes);
		}
	}
}

function sendSystemMessageToUser(matchId: string, userId: string, message: string): void {
	const userConns = userConnections.get(userId);
	if (!userConns) return;

	const messageId = `sys_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	const timestamp = BigInt(Date.now());

	const systemMsg = createChatBroadcast(matchId, messageId, "system", "System", undefined, "#f59e0b", message, timestamp);

	const msgBytes = serializeMessage(systemMsg);
	for (const connId of userConns) {
		const ws = connections.get(connId);
		if (ws && ws.readyState === 1 && ws.data.matchId === matchId) {
			ws.send(msgBytes);
		}
	}
}

function getMatchPlayersInfo(matchId: string): Array<{ userId: string; username: string; connId: string }> {
	const players = matchPlayers.get(matchId);
	if (!players) return [];

	const result: Array<{ userId: string; username: string; connId: string }> = [];
	for (const connId of players) {
		const ws = connections.get(connId);
		if (ws && ws.data.userId && ws.data.username) {
			result.push({
				userId: ws.data.userId,
				username: ws.data.username,
				connId,
			});
		}
	}
	return result;
}

function fuzzyMatchPlayers(
	query: string,
	players: Array<{ userId: string; username: string; connId: string }>
): Array<{ userId: string; username: string; connId: string }> {
	const lowerQuery = query.toLowerCase();

	const exactMatch = players.filter((p) => p.username.toLowerCase() === lowerQuery);
	if (exactMatch.length > 0) return exactMatch;

	const startsWithMatch = players.filter((p) => p.username.toLowerCase().startsWith(lowerQuery));
	if (startsWithMatch.length > 0) return startsWithMatch;

	const containsMatch = players.filter((p) => p.username.toLowerCase().includes(lowerQuery));
	return containsMatch;
}

function getUniquePlayerCount(matchId: string): number {
	const players = matchPlayers.get(matchId);
	if (!players) return 0;

	const uniqueUsers = new Set<string>();
	for (const connId of players) {
		const ws = connections.get(connId);
		if (ws && ws.data.userId) {
			uniqueUsers.add(ws.data.userId);
		}
	}
	return uniqueUsers.size;
}

function handleKickCommand(matchId: string, initiatorUserId: string, initiatorUsername: string, targetQuery: string): void {
	const existingVote = activeVoteKicks.get(matchId);
	if (existingVote) {
		if (Date.now() - existingVote.startedAt > VOTE_KICK_DURATION_MS) {
			activeVoteKicks.delete(matchId);
			broadcastSystemMessage(matchId, `Vote kick against ${existingVote.targetUsername} expired.`);
		} else {
			broadcastSystemMessage(matchId, `A vote kick is already in progress against ${existingVote.targetUsername}. Type 'y' to vote.`);
			return;
		}
	}

	if (!targetQuery) {
		broadcastSystemMessage(matchId, "Usage: !kick <player name>");
		return;
	}

	const allPlayers = getMatchPlayersInfo(matchId);

	const uniquePlayers = new Map<string, { userId: string; username: string; connId: string }>();
	for (const player of allPlayers) {
		if (!uniquePlayers.has(player.userId)) {
			uniquePlayers.set(player.userId, player);
		}
	}
	const playersArray = Array.from(uniquePlayers.values());

	const filteredPlayers = playersArray.filter((p) => p.userId !== initiatorUserId);

	const matches = fuzzyMatchPlayers(targetQuery, filteredPlayers);

	if (matches.length === 0) {
		broadcastSystemMessage(matchId, `No player found matching "${targetQuery}".`);
		return;
	}

	if (matches.length > 1) {
		const names = matches.map((m) => m.username).join(", ");
		broadcastSystemMessage(matchId, `Multiple players found: ${names}. Please be more specific.`);
		return;
	}

	const target = matches[0];
	const totalPlayers = getUniquePlayerCount(matchId);
	const eligibleVoters = totalPlayers - 1;
	const votesNeeded = Math.max(1, Math.ceil(eligibleVoters * VOTE_KICK_THRESHOLD));

	const voteKick: ActiveVoteKick = {
		targetUserId: target.userId,
		targetUsername: target.username,
		initiatorUserId,
		initiatorUsername,
		votesFor: new Set([initiatorUserId]),
		startedAt: Date.now(),
		messageId: `vote_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
	};

	activeVoteKicks.set(matchId, voteKick);

	if (voteKick.votesFor.size >= votesNeeded) {
		activeVoteKicks.delete(matchId);

		if (!matchBannedUsers.has(matchId)) {
			matchBannedUsers.set(matchId, new Set());
		}
		matchBannedUsers.get(matchId)!.add(voteKick.targetUserId);

		broadcastSystemMessage(matchId, `${voteKick.targetUsername} has been vote kicked! (${voteKick.votesFor.size}/${votesNeeded} votes)`);
		kickUserFromMatch(matchId, voteKick.targetUserId);

		return;
	}

	broadcastSystemMessage(
		matchId,
		`Vote kick ${target.username}? Type 'y' to vote. (${voteKick.votesFor.size}/${votesNeeded} votes, ${Math.ceil(
			VOTE_KICK_DURATION_MS / 1000
		)}s remaining)`
	);

	setTimeout(() => {
		const currentVote = activeVoteKicks.get(matchId);
		if (currentVote && currentVote.messageId === voteKick.messageId) {
			activeVoteKicks.delete(matchId);
			broadcastSystemMessage(matchId, `Vote kick against ${target.username} expired - not enough votes.`);
		}
	}, VOTE_KICK_DURATION_MS);
}

function handleVoteResponse(matchId: string, userId: string, username: string, voteYes: boolean): void {
	const voteKick = activeVoteKicks.get(matchId);
	if (!voteKick) {
		return;
	}

	if (Date.now() - voteKick.startedAt > VOTE_KICK_DURATION_MS) {
		activeVoteKicks.delete(matchId);
		broadcastSystemMessage(matchId, `Vote kick against ${voteKick.targetUsername} expired.`);
		return;
	}

	if (userId === voteKick.targetUserId) {
		sendSystemMessageToUser(matchId, userId, "You cannot vote on your own kick.");
		return;
	}

	if (voteKick.votesFor.has(userId)) {
		return;
	}

	if (voteYes) {
		voteKick.votesFor.add(userId);
	}

	const totalPlayers = getUniquePlayerCount(matchId);
	const eligibleVoters = totalPlayers - 1;
	const votesNeeded = Math.max(1, Math.ceil(eligibleVoters * VOTE_KICK_THRESHOLD));
	const currentVotes = voteKick.votesFor.size;

	if (currentVotes >= votesNeeded) {
		activeVoteKicks.delete(matchId);

		if (!matchBannedUsers.has(matchId)) {
			matchBannedUsers.set(matchId, new Set());
		}
		matchBannedUsers.get(matchId)!.add(voteKick.targetUserId);

		broadcastSystemMessage(matchId, `${voteKick.targetUsername} has been vote kicked! (${currentVotes}/${votesNeeded} votes)`);
		kickUserFromMatch(matchId, voteKick.targetUserId);
	} else {
		const timeRemaining = Math.ceil((VOTE_KICK_DURATION_MS - (Date.now() - voteKick.startedAt)) / 1000);
		broadcastSystemMessage(
			matchId,
			`Vote kick ${voteKick.targetUsername}? Type 'y' to vote. (${currentVotes}/${votesNeeded} votes, ${timeRemaining}s remaining)`
		);
	}
}

function kickUserFromMatch(matchId: string, targetUserId: string): void {
	const userConns = userConnections.get(targetUserId);
	if (!userConns) return;

	for (const connId of userConns) {
		const ws = connections.get(connId);
		if (ws && ws.data.matchId === matchId) {
			ws.send(serializeMessage(createErrorMessage("VOTE_KICKED", "You have been vote kicked from this match.")));

			ws.close(4000, "Vote kicked");
		}
	}
}
