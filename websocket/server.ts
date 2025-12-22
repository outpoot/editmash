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
	isTimelineSyncMessage,
	isRequestTimelineSyncMessage,
	isPingMessage,
	isSubscribeLobbiesMessage,
	isUnsubscribeLobbiesMessage,
	createLeaveMatchMessage,
	createPlayerJoinedMessage,
	createPlayerLeftMessage,
	createPlayerCountMessage,
	createMatchStatusMessage,
	createRequestTimelineSyncMessage,
	createLobbiesUpdateMessage,
	createErrorMessage,
	createPongMessage,
	toLobbyInfoProto,
} from "./types";

interface WebSocketData {
	id: string;
	matchId: string | null;
	userId: string | null;
	username: string | null;
	subscribedToLobbies: boolean;
	connectedAt: number;
	lastPing: number;
}

const matchPlayers = new Map<string, Set<string>>();
const connections = new Map<string, ServerWebSocket<WebSocketData>>();
const lobbySubscribers = new Set<string>();

const pendingTimelineSyncs = new Map<string, ReturnType<typeof setTimeout>>();
const TIMELINE_SYNC_DELAY = 1000; // 1 second debounce

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
		console.log(`[WS] Media upload rejected - connection matchId: ${ws.data.matchId}, message matchId: ${matchId}`);
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
	}
	const players = matchPlayers.get(matchId);
	console.log(`[WS] Broadcasting media to ${players?.size ?? 0} players in match ${matchId} (excluding sender)`);

	broadcast(matchId, msg, ws.data.id);

	console.log(`[WS] Media uploaded in match ${matchId}: ${media?.name} by ${media?.uploadedBy?.username}`);
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

	broadcast(matchId, msg, ws.data.id);

	requestTimelineSync(matchId);
}

function handleClipUpdated(ws: ServerWebSocket<WebSocketData>, msg: WSMessage) {
	if (msg.payload.case !== "clipUpdated" || !msg.payload.value) return;
	const { matchId, trackId, clipId, updatedBy } = msg.payload.value;

	if (ws.data.matchId !== matchId) {
		ws.send(serializeMessage(createErrorMessage("NOT_IN_MATCH", "You are not in this match")));
		return;
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

	broadcast(matchId, msg, ws.data.id);

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
					type: track.type === TrackType.VIDEO ? "video" : "audio",
					clips: track.clips.map((clip) => ({
						id: clip.id,
						type: clip.type === MediaType.VIDEO ? "video" : clip.type === MediaType.AUDIO ? "audio" : "image",
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
									volume: clip.properties.volume,
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

		if (isTimelineSyncMessage(message)) {
			handleTimelineSync(ws, message);
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
