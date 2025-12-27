import type { ServerWebSocket } from "bun";
import { timingSafeEqual, createHash } from "crypto";
import {
	type WSMessage,
	MessageType,
	MediaType,
	TrackType,
	serializeMessage,
	deserializeMessage,
	isJoinMatchMessage,
	isLeaveMatchMessage,
	isMediaUploadedMessage,
	isMediaRemovedMessage,
	isClipAddedMessage,
	isClipUpdatedMessage,
	isClipRemovedMessage,
	isClipSplitMessage,
	isTimelineSyncMessage,
	isRequestTimelineSyncMessage,
	isPingMessage,
	isSubscribeLobbiesMessage,
	isUnsubscribeLobbiesMessage,
	isClipSelectionMessage,
	isZoneSubscribeMessage,
	isClipBatchUpdateMessage,
	createLeaveMatchMessage,
	createPlayerJoinedMessage,
	createPlayerLeftMessage,
	createPlayerCountMessage,
	createMatchStatusMessage,
	createRequestTimelineSyncMessage,
	createLobbiesUpdateMessage,
	createErrorMessage,
	createPongMessage,
	createZoneClipsMessage,
	createClipIdMappingMessage,
	createClipBatchUpdateMessage,
	createClipDeltaUpdate,
	applyClipDelta,
	toLobbyInfoProto,
	createTrackProto,
	createClipDataProto,
	type Track,
	type ClipDeltaUpdate,
} from "./types";

interface ClientZone {
	startTime: number;
	endTime: number;
}

interface WebSocketData {
	id: string;
	matchId: string | null;
	userId: string | null;
	username: string | null;
	subscribedToLobbies: boolean;
	connectedAt: number;
	lastPing: number;
	zone: ClientZone | null;
}

const matchPlayers = new Map<string, Set<string>>();
const connections = new Map<string, ServerWebSocket<WebSocketData>>();
const lobbySubscribers = new Set<string>();

const matchTimelines = new Map<
	string,
	{
		duration: number;
		tracks: Array<{
			id: string;
			type: "video" | "audio";
			clips: Array<{
				id: string;
				type: "video" | "audio" | "image";
				name: string;
				src: string;
				startTime: number;
				duration: number;
				sourceIn: number;
				sourceDuration: number;
				thumbnail?: string;
				properties: Record<string, unknown>;
			}>;
		}>;
	}
>();

const pendingTimelineSyncs = new Map<string, ReturnType<typeof setTimeout>>();
const TIMELINE_SYNC_DELAY = 3000; // 3 second debounce for timeline sync to DB
const ZONE_BUFFER = 2; // zone boundaries to ensure clips near zone edges are included for seamless playback

interface ClipIdMap {
	fullToShort: Map<string, number>;
	shortToFull: Map<number, { fullId: string; trackId: string }>;
	nextShortId: number;
}

const matchClipIdMaps = new Map<string, ClipIdMap>();

function getOrCreateClipIdMap(matchId: string): ClipIdMap {
	let map = matchClipIdMaps.get(matchId);
	if (!map) {
		map = {
			fullToShort: new Map(),
			shortToFull: new Map(),
			nextShortId: 1,
		};
		matchClipIdMaps.set(matchId, map);
	}
	return map;
}

function getShortClipId(matchId: string, fullId: string, trackId: string): number {
	const map = getOrCreateClipIdMap(matchId);
	let shortId = map.fullToShort.get(fullId);
	if (shortId === undefined) {
		shortId = map.nextShortId++;
		map.fullToShort.set(fullId, shortId);
		map.shortToFull.set(shortId, { fullId, trackId });
	}
	return shortId;
}

function getFullClipId(matchId: string, shortId: number): { fullId: string; trackId: string } | null {
	const map = matchClipIdMaps.get(matchId);
	return map?.shortToFull.get(shortId) ?? null;
}

function removeClipIdMapping(matchId: string, fullId: string): void {
	const map = matchClipIdMaps.get(matchId);
	if (!map) return;
	const shortId = map.fullToShort.get(fullId);
	if (shortId !== undefined) {
		map.fullToShort.delete(fullId);
		map.shortToFull.delete(shortId);
	}
}

const BATCH_WINDOW_MS = 50; // ms
const pendingBatches = new Map<
	string,
	{
		updates: Map<string, { shortId: number; trackId: string; changes: Partial<TimelineClip> }>;
		timeout: ReturnType<typeof setTimeout>;
		userId: string;
		username: string;
	}
>();

function flushBatch(matchId: string, connId: string) {
	const key = `${matchId}:${connId}`;
	const batch = pendingBatches.get(key);
	if (!batch || batch.updates.size === 0) {
		pendingBatches.delete(key);
		return;
	}

	const deltaUpdates: ClipDeltaUpdate[] = [];
	for (const [clipId, update] of batch.updates) {
		const clipInfo = getFullClipId(matchId, update.shortId);
		const originalTrackId = clipInfo?.trackId;
		const newTrackId = originalTrackId && originalTrackId !== update.trackId ? update.trackId : undefined;

		if (newTrackId && clipInfo) {
			const map = matchClipIdMaps.get(matchId);
			if (map) {
				map.shortToFull.set(update.shortId, { fullId: clipInfo.fullId, trackId: newTrackId });
			}
		}

		const delta = createClipDeltaUpdate(update.shortId, {
			startTime: update.changes.startTime,
			duration: update.changes.duration,
			sourceIn: update.changes.sourceIn,
			properties: update.changes.properties as Record<string, unknown> | undefined,
			newTrackId,
		});
		deltaUpdates.push(delta);
	}

	if (deltaUpdates.length > 0) {
		const batchMsg = createClipBatchUpdateMessage(matchId, deltaUpdates, {
			userId: batch.userId,
			username: batch.username,
		});
		broadcast(matchId, batchMsg, connId);
	}

	pendingBatches.delete(key);
}

function queueClipUpdate(
	matchId: string,
	connId: string,
	clipId: string,
	trackId: string,
	changes: Partial<TimelineClip>,
	userId: string,
	username: string
): void {
	const key = `${matchId}:${connId}`;
	let batch = pendingBatches.get(key);

	if (!batch) {
		batch = {
			updates: new Map(),
			timeout: setTimeout(() => flushBatch(matchId, connId), BATCH_WINDOW_MS),
			userId,
			username,
		};
		pendingBatches.set(key, batch);
	}

	const shortId = getShortClipId(matchId, clipId, trackId);

	const existing = batch.updates.get(clipId);
	if (existing) {
		batch.updates.set(clipId, {
			shortId,
			trackId,
			changes: { ...existing.changes, ...changes },
		});
	} else {
		batch.updates.set(clipId, { shortId, trackId, changes });
	}
}

type TimelineClip = {
	id: string;
	type: "video" | "audio" | "image";
	name: string;
	src: string;
	startTime: number;
	duration: number;
	sourceIn: number;
	sourceDuration: number;
	thumbnail?: string;
	properties: Record<string, unknown>;
};

type CachedTimeline = {
	duration: number;
	tracks: Array<{
		id: string;
		type: "video" | "audio";
		clips: TimelineClip[];
	}>;
};

function updateCacheClipAdded(matchId: string, trackId: string, clip: TimelineClip) {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) return;

	const track = timeline.tracks.find((t) => t.id === trackId);
	if (!track) return;

	if (track.clips.some((c) => c.id === clip.id)) return;

	track.clips.push(clip);
}

function updateCacheClipUpdated(matchId: string, trackId: string, clipId: string, updates: Partial<TimelineClip>) {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) return;

	let track = timeline.tracks.find((t) => t.id === trackId);
	let clipIndex = track?.clips.findIndex((c) => c.id === clipId) ?? -1;

	if (clipIndex === -1) {
		for (const t of timeline.tracks) {
			const idx = t.clips.findIndex((c) => c.id === clipId);
			if (idx !== -1) {
				const [clip] = t.clips.splice(idx, 1);
				const targetTrack = timeline.tracks.find((tr) => tr.id === trackId);
				if (targetTrack && clip) {
					targetTrack.clips.push({ ...clip, ...updates } as TimelineClip);
				}
				return;
			}
		}
		return;
	}

	if (track && clipIndex !== -1) {
		track.clips[clipIndex] = { ...track.clips[clipIndex], ...updates } as TimelineClip;
	}
}

function updateCacheClipRemoved(matchId: string, trackId: string, clipId: string) {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) return;

	for (const track of timeline.tracks) {
		const clipIndex = track.clips.findIndex((c) => c.id === clipId);
		if (clipIndex !== -1) {
			track.clips.splice(clipIndex, 1);
			return;
		}
	}
}

function updateCacheClipSplit(matchId: string, trackId: string, originalClip: TimelineClip, newClip: TimelineClip) {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) return;

	const track = timeline.tracks.find((t) => t.id === trackId);
	if (!track) return;

	const originalIndex = track.clips.findIndex((c) => c.id === originalClip.id);
	if (originalIndex !== -1) {
		track.clips[originalIndex] = originalClip;
	}

	if (!track.clips.some((c) => c.id === newClip.id)) {
		track.clips.push(newClip);
	}
}

function getCachedClipTiming(matchId: string, clipId: string): { startTime: number; duration: number } | null {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) return null;

	for (const track of timeline.tracks) {
		const clip = track.clips.find((c) => c.id === clipId);
		if (clip) {
			return { startTime: clip.startTime, duration: clip.duration };
		}
	}
	return null;
}

function cleanupMatchResources(matchId: string) {
	const pendingSync = pendingTimelineSyncs.get(matchId);
	if (pendingSync) {
		clearTimeout(pendingSync);
		pendingTimelineSyncs.delete(matchId);
	}
	matchTimelines.delete(matchId);
	matchClipIdMaps.delete(matchId);

	for (const [key, batch] of pendingBatches.entries()) {
		if (key.startsWith(`${matchId}:`)) {
			clearTimeout(batch.timeout);
			pendingBatches.delete(key);
		}
	}
}

const PORT = parseInt(process.env.WS_PORT || "3001", 10);
const IDLE_TIMEOUT = 120; // seconds
const WS_API_KEY = process.env.WS_API_KEY;

function secureCompare(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;

	const hashA = createHash("sha256").update(a).digest();
	const hashB = createHash("sha256").update(b).digest();

	return timingSafeEqual(hashA, hashB);
}

function generateConnectionId(): string {
	return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function requestTimelineSync(matchId: string) {
	const existing = pendingTimelineSyncs.get(matchId);
	if (existing) {
		clearTimeout(existing);
	}

	const timeout = setTimeout(() => {
		pendingTimelineSyncs.delete(matchId);

		const players = matchPlayers.get(matchId);
		if (!players || players.size === 0) return;

		const firstConnId = players.values().next().value;
		if (!firstConnId) return;

		const ws = connections.get(firstConnId);
		if (ws && ws.readyState === 1) {
			ws.send(serializeMessage(createRequestTimelineSyncMessage(matchId)));
			console.log(`[WS] Requested timeline sync from ${firstConnId} for match ${matchId}`);
		}
	}, TIMELINE_SYNC_DELAY);

	pendingTimelineSyncs.set(matchId, timeout);
}

function broadcast(matchId: string, message: WSMessage, excludeConnectionId?: string) {
	const players = matchPlayers.get(matchId);
	if (!players) return;

	const msgBytes = serializeMessage(message);

	for (const connId of players) {
		if (excludeConnectionId && connId === excludeConnectionId) continue;

		const ws = connections.get(connId);
		if (ws && ws.readyState === 1) {
			ws.send(msgBytes);
		}
	}
}

function clipInZone(clipStartTime: number, clipDuration: number, zone: ClientZone | null): boolean {
	if (!zone) return true;
	const clipEndTime = clipStartTime + clipDuration;
	const zoneStart = zone.startTime - ZONE_BUFFER;
	const zoneEnd = zone.endTime + ZONE_BUFFER;

	return clipStartTime < zoneEnd && clipEndTime > zoneStart;
}

function broadcastClipMessage(
	matchId: string,
	message: WSMessage,
	clipStartTime: number | undefined,
	clipDuration: number | undefined,
	excludeConnectionId?: string
) {
	const players = matchPlayers.get(matchId);
	if (!players) return;

	const msgBytes = serializeMessage(message);

	const hasValidTiming = clipStartTime !== undefined && clipDuration !== undefined;

	for (const connId of players) {
		if (excludeConnectionId && connId === excludeConnectionId) continue;

		const ws = connections.get(connId);
		if (ws && ws.readyState === 1) {
			if (!hasValidTiming || clipInZone(clipStartTime, clipDuration, ws.data.zone)) {
				ws.send(msgBytes);
			}
		}
	}
}

function broadcastToLobbySubscribers(message: WSMessage, excludeConnectionId?: string) {
	const msgBytes = serializeMessage(message);

	for (const connId of lobbySubscribers) {
		if (excludeConnectionId && connId === excludeConnectionId) continue;

		const ws = connections.get(connId);
		if (ws && ws.readyState === 1) {
			ws.send(msgBytes);
		}
	}
}

async function fetchLobbies() {
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
				audioMaxVolume: number;
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

function handleSubscribeLobbies(ws: ServerWebSocket<WebSocketData>) {
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

function handleUnsubscribeLobbies(ws: ServerWebSocket<WebSocketData>) {
	ws.data.subscribedToLobbies = false;
	lobbySubscribers.delete(ws.data.id);
	console.log(`[WS] Connection ${ws.data.id} unsubscribed from lobbies`);
}

function handleJoinMatch(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
	if (msg.payload.case !== "joinMatch" || !msg.payload.value) return;
	const { matchId, userId, username } = msg.payload.value;

	if (ws.data.matchId) {
		handleLeaveMatch(ws, createLeaveMatchMessage(ws.data.matchId, ws.data.userId!));
	}

	ws.data.matchId = matchId;
	ws.data.userId = userId;
	ws.data.username = username;

	ws.subscribe(`match:${matchId}`);

	if (!matchPlayers.has(matchId)) {
		matchPlayers.set(matchId, new Set());
	}
	matchPlayers.get(matchId)!.add(ws.data.id);

	const playerCount = matchPlayers.get(matchId)!.size;
	ws.send(serializeMessage(createPlayerCountMessage(matchId, playerCount)));

	broadcast(matchId, createPlayerJoinedMessage(matchId, { userId, username }), ws.data.id);

	console.log(`[WS] Player ${username} (${userId}) joined match ${matchId}`);
}

function handleLeaveMatch(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
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

function handleMediaUploaded(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
	if (msg.payload.case !== "mediaUploaded" || !msg.payload.value) return;
	const { matchId, media } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	broadcast(matchId, msg, ws.data.id);
}

function handleMediaRemoved(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
	if (msg.payload.case !== "mediaRemoved" || !msg.payload.value) return;
	const { matchId, mediaId } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	broadcast(matchId, msg, ws.data.id);

	console.log(`[WS] Media removed in match ${matchId}: ${mediaId}`);
}

function handleClipAdded(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
	if (msg.payload.case !== "clipAdded" || !msg.payload.value) return;
	const { matchId, trackId, clip, addedBy } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	if (!clip || clip.startTime === undefined || clip.duration === undefined) {
		console.warn(`[WS] clipAdded missing clip timing data for match ${matchId}, will broadcast to all clients`);
	}

	if (clip) {
		const mediaTypeMap: Record<number, "video" | "audio" | "image"> = { 1: "video", 2: "audio", 3: "image" };
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
	}

	const clipStartTime = clip?.startTime;
	const clipDuration = clip?.duration;
	broadcastClipMessage(matchId, msg, clipStartTime, clipDuration, ws.data.id);

	requestTimelineSync(matchId);
}

function handleClipUpdated(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
	if (msg.payload.case !== "clipUpdated" || !msg.payload.value) return;
	const { matchId, trackId, clipId, updates, updatedBy } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	if (updates) {
		const mediaTypeMap: Record<number, "video" | "audio" | "image"> = { 1: "video", 2: "audio", 3: "image" };
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

function handleClipRemoved(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
	if (msg.payload.case !== "clipRemoved" || !msg.payload.value) return;
	const { matchId, trackId, clipId, removedBy } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	updateCacheClipRemoved(matchId, trackId, clipId);
	removeClipIdMapping(matchId, clipId);
	broadcast(matchId, msg, ws.data.id);
	requestTimelineSync(matchId);
}

function handleClipBatchUpdate(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
	if (msg.payload.case !== "clipBatchUpdate" || !msg.payload.value) return;
	const { matchId, updates, updatedBy } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	if (!updates || updates.length === 0) return;

	for (const delta of updates) {
		const clipInfo = getFullClipId(matchId, delta.shortId);
		if (!clipInfo) {
			console.warn(`[WS] Unknown short clip ID ${delta.shortId} in batch update for match ${matchId}`);
			continue;
		}

		const { fullId: clipId, trackId } = clipInfo;

		const timeline = matchTimelines.get(matchId);
		if (timeline) {
			for (const track of timeline.tracks) {
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

function handleClipSplit(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
	if (msg.payload.case !== "clipSplit" || !msg.payload.value) return;
	const { matchId, trackId, originalClip, newClip, splitBy } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	if (!originalClip || !newClip) {
		ws.send(serializeMessage(createErrorMessage("INVALID_PAYLOAD", "Missing clip data in split message")));
		return;
	}

	const mediaTypeMap: Record<number, "video" | "audio" | "image"> = { 1: "video", 2: "audio", 3: "image" };
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

	const splitSpanDuration = newClip.startTime + newClip.duration - originalClip.startTime;
	broadcastClipMessage(matchId, msg, originalClip.startTime, splitSpanDuration, ws.data.id);

	requestTimelineSync(matchId);
}

async function handleTimelineSync(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
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

function handleClipSelection(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
	if (msg.payload.case !== "clipSelection" || !msg.payload.value) return;
	const { matchId } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}

	broadcast(matchId, msg, ws.data.id);
}

function handleZoneSubscribe(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
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

	const zoneTracks: Track[] = timeline.tracks.map((track) => {
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

function handleMessage(ws: ServerWebSocket<WebSocketData>, rawMessage: string | Buffer | ArrayBuffer) {
	try {
		if (typeof rawMessage === "string") {
			ws.send(serializeMessage(createErrorMessage("INVALID_MESSAGE", "Text messages are not supported, use binary")));
			return;
		}

		const bytes = new Uint8Array(rawMessage);
		const message = deserializeMessage(bytes);

		ws.data.lastPing = Date.now();

		if (isPingMessage(message)) {
			ws.send(serializeMessage(createPongMessage()));
			return;
		}

		if (isJoinMatchMessage(message)) {
			handleJoinMatch(ws, message);
			return;
		}

		if (isLeaveMatchMessage(message)) {
			handleLeaveMatch(ws, message);
			return;
		}

		if (isMediaUploadedMessage(message)) {
			handleMediaUploaded(ws, message);
			return;
		}

		if (isMediaRemovedMessage(message)) {
			handleMediaRemoved(ws, message);
			return;
		}

		if (isClipAddedMessage(message)) {
			handleClipAdded(ws, message);
			return;
		}

		if (isClipUpdatedMessage(message)) {
			handleClipUpdated(ws, message);
			return;
		}

		if (isClipRemovedMessage(message)) {
			handleClipRemoved(ws, message);
			return;
		}

		if (isClipSplitMessage(message)) {
			handleClipSplit(ws, message);
			return;
		}

		if (isClipBatchUpdateMessage(message)) {
			handleClipBatchUpdate(ws, message);
			return;
		}

		if (isTimelineSyncMessage(message)) {
			handleTimelineSync(ws, message);
			return;
		}

		if (isClipSelectionMessage(message)) {
			handleClipSelection(ws, message);
			return;
		}

		if (isZoneSubscribeMessage(message)) {
			handleZoneSubscribe(ws, message);
			return;
		}

		if (isSubscribeLobbiesMessage(message)) {
			handleSubscribeLobbies(ws);
			return;
		}

		if (isUnsubscribeLobbiesMessage(message)) {
			handleUnsubscribeLobbies(ws);
			return;
		}

		console.log(`[WS] Unknown message type: ${message.type}`);
	} catch (error) {
		console.error("[WS] Failed to parse message:", error);
		ws.send(serializeMessage(createErrorMessage("INVALID_MESSAGE", "Failed to parse message")));
	}
}

function handleClose(ws: ServerWebSocket<WebSocketData>) {
	const { id, matchId, userId, username, subscribedToLobbies } = ws.data;

	connections.delete(id);

	if (subscribedToLobbies) {
		lobbySubscribers.delete(id);
	}

	if (matchId && userId) {
		const players = matchPlayers.get(matchId);
		if (players) {
			players.delete(id);
			if (players.size === 0) {
				matchPlayers.delete(matchId);
				cleanupMatchResources(matchId);
			}
		}

		broadcast(matchId, createPlayerLeftMessage(matchId, userId));
	}

	console.log(`[WS] Connection closed: ${id} (user: ${username || "unknown"})`);
}

async function notifyLobbyChange() {
	if (lobbySubscribers.size === 0) return;

	const lobbies = await fetchLobbies();
	const protoLobbies = lobbies.map(toLobbyInfoProto);
	broadcastToLobbySubscribers(createLobbiesUpdateMessage(protoLobbies));
	console.log(`[WS] Broadcast lobby update to ${lobbySubscribers.size} subscribers`);
}

const server = Bun.serve({
	port: PORT,

	async fetch(req, server) {
		const url = new URL(req.url);

		if (url.pathname === "/health") {
			return new Response(
				JSON.stringify({
					status: "ok",
					connections: connections.size,
					matches: matchPlayers.size,
					lobbySubscribers: lobbySubscribers.size,
					timestamp: Date.now(),
				}),
				{
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		if (url.pathname === "/notify/lobbies" && req.method === "POST") {
			const authHeader = req.headers.get("Authorization");
			const providedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

			if (!secureCompare(providedKey, WS_API_KEY)) {
				console.warn("[WS] Unauthorized /notify/lobbies request");
				return new Response(JSON.stringify({ error: "Unauthorized" }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				});
			}

			notifyLobbyChange().catch((error) => {
				console.error("[WS] Error in notifyLobbyChange:", error);
			});

			return new Response(JSON.stringify({ ok: true }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		if (url.pathname === "/notify/match" && req.method === "POST") {
			const authHeader = req.headers.get("Authorization");
			const providedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

			if (!secureCompare(providedKey, WS_API_KEY)) {
				console.warn("[WS] Unauthorized /notify/match request");
				return new Response(JSON.stringify({ error: "Unauthorized" }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				});
			}

			try {
				const body = await req.json();
				const { matchId, status, timeRemaining } = body;

				if (matchId) {
					const players = matchPlayers.get(matchId);
					if (players && players.size > 0) {
						broadcast(matchId, createMatchStatusMessage(matchId, status, timeRemaining, players.size));
						console.log(`[WS] Broadcast match status to ${players.size} players: ${matchId} -> ${status}`);
					}
				}

				return new Response(JSON.stringify({ ok: true }), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				console.error("[WS] Error parsing /notify/match body:", error);
				return new Response(JSON.stringify({ error: "Invalid request body" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
		}

		if (url.pathname === "/ws") {
			const connectionId = generateConnectionId();

			const upgraded = server.upgrade(req, {
				data: {
					id: connectionId,
					matchId: null,
					userId: null,
					username: null,
					subscribedToLobbies: false,
					connectedAt: Date.now(),
					lastPing: Date.now(),
					zone: null,
				} satisfies WebSocketData,
			});

			if (upgraded) {
				return undefined;
			}

			return new Response("WebSocket upgrade failed", { status: 500 });
		}

		return new Response("Not found", { status: 404 });
	},

	websocket: {
		data: {} as WebSocketData,

		idleTimeout: IDLE_TIMEOUT,
		maxPayloadLength: 1024 * 1024, // 1MB
		sendPings: true,
		perMessageDeflate: true,

		open(ws) {
			connections.set(ws.data.id, ws);
			console.log(`[WS] New connection: ${ws.data.id}`);
		},

		message(ws, message) {
			handleMessage(ws, message);
		},

		close(ws, code, reason) {
			handleClose(ws);
		},

		drain(ws) {
			console.log(`[WS] Socket ready for more data: ${ws.data.id}`);
		},
	},
});

console.log(`[WS] EditMash WebSocket server running on port ${PORT}`);

export { server, broadcast, matchPlayers, connections };
