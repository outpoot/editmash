import type { ServerWebSocket } from "bun";
import { timingSafeEqual, createHash } from "crypto";
import {
	connections,
	matchPlayers,
	lobbySubscribers,
	PORT,
	IDLE_TIMEOUT,
	WS_API_KEY,
	generateConnectionId,
	type WebSocketData,
} from "./state";
import {
	type WSMessage,
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
	createPlayerLeftMessage,
	createMatchStatusMessage,
	createLobbiesUpdateMessage,
	createErrorMessage,
	createPongMessage,
	toLobbyInfoProto,
} from "./types";
import { cleanupMatchResources } from "./timelineCache";
import { broadcast, broadcastToLobbySubscribers } from "./broadcast";
import {
	fetchLobbies,
	handleSubscribeLobbies,
	handleUnsubscribeLobbies,
	handleJoinMatch,
	handleLeaveMatch,
	handleMediaUploaded,
	handleMediaRemoved,
	handleClipAdded,
	handleClipUpdated,
	handleClipRemoved,
	handleClipBatchUpdate,
	handleClipSplit,
	handleTimelineSync,
	handleClipSelection,
	handleZoneSubscribe,
} from "./handlers";

function secureCompare(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;

	const hashA = createHash("sha256").update(a).digest();
	const hashB = createHash("sha256").update(b).digest();

	return timingSafeEqual(hashA, hashB);
}

function handleMessage(ws: ServerWebSocket<WebSocketData>, rawMessage: string | Buffer | ArrayBuffer): void {
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

function handleClose(ws: ServerWebSocket<WebSocketData>): void {
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

async function notifyLobbyChange(): Promise<void> {
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

		// WebSocket upgrade
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
