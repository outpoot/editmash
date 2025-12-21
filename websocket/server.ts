import type { ServerWebSocket } from "bun";
import {
	WSMessage,
	JoinMatchMessage,
	LeaveMatchMessage,
	MediaUploadedMessage,
	MediaRemovedMessage,
	LobbyInfo,
	isJoinMatchMessage,
	isLeaveMatchMessage,
	isMediaUploadedMessage,
	isMediaRemovedMessage,
	isPingMessage,
	createMessage,
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

const PORT = parseInt(process.env.WS_PORT || "3001", 10);
const IDLE_TIMEOUT = 120; // seconds
const WS_API_KEY = process.env.WS_API_KEY;

function generateConnectionId(): string {
	return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function broadcast(matchId: string, message: WSMessage, excludeConnectionId?: string) {
	const players = matchPlayers.get(matchId);
	if (!players) return;

	const msgStr = JSON.stringify(message);

	for (const connId of players) {
		if (excludeConnectionId && connId === excludeConnectionId) continue;

		const ws = connections.get(connId);
		if (ws && ws.readyState === 1) {
			ws.send(msgStr);
		}
	}
}

function broadcastToLobbySubscribers(message: WSMessage, excludeConnectionId?: string) {
	const msgStr = JSON.stringify(message);

	for (const connId of lobbySubscribers) {
		if (excludeConnectionId && connId === excludeConnectionId) continue;

		const ws = connections.get(connId);
		if (ws && ws.readyState === 1) {
			ws.send(msgStr);
		}
	}
}

async function fetchLobbies(): Promise<LobbyInfo[]> {
	try {
		const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
		const [waitingRes, inMatchRes] = await Promise.all([
			fetch(`${apiUrl}/api/lobbies?status=waiting`),
			fetch(`${apiUrl}/api/lobbies?status=in_match`),
		]);

		const lobbies: LobbyInfo[] = [];

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
			ws.send(JSON.stringify(createMessage("lobbies_update", { lobbies })));
		}
	});
}

function handleUnsubscribeLobbies(ws: ServerWebSocket<WebSocketData>) {
	ws.data.subscribedToLobbies = false;
	lobbySubscribers.delete(ws.data.id);
	console.log(`[WS] Connection ${ws.data.id} unsubscribed from lobbies`);
}

function handleJoinMatch(ws: ServerWebSocket<WebSocketData>, message: JoinMatchMessage) {
	const { matchId, userId, username } = message.payload;

	if (ws.data.matchId) {
		handleLeaveMatch(
			ws,
			createMessage("leave_match", {
				matchId: ws.data.matchId,
				userId: ws.data.userId!,
			})
		);
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
	ws.send(
		JSON.stringify(
			createMessage("player_count", {
				matchId,
				count: playerCount,
			})
		)
	);

	broadcast(
		matchId,
		createMessage("player_joined", {
			matchId,
			player: { userId, username },
		}),
		ws.data.id
	);

	console.log(`[WS] Player ${username} (${userId}) joined match ${matchId}`);
}

function handleLeaveMatch(ws: ServerWebSocket<WebSocketData>, message: LeaveMatchMessage) {
	const { matchId, userId } = message.payload;

	ws.unsubscribe(`match:${matchId}`);

	const players = matchPlayers.get(matchId);
	if (players) {
		players.delete(ws.data.id);
		if (players.size === 0) {
			matchPlayers.delete(matchId);
		}
	}

	broadcast(matchId, createMessage("player_left", { matchId, userId }));

	ws.data.matchId = null;
	ws.data.userId = null;
	ws.data.username = null;

	console.log(`[WS] Player ${userId} left match ${matchId}`);
}

function handleMediaUploaded(ws: ServerWebSocket<WebSocketData>, message: MediaUploadedMessage) {
	const { matchId, media } = message.payload;

	if (ws.data.matchId !== matchId) {
		console.log(`[WS] Media upload rejected - connection matchId: ${ws.data.matchId}, message matchId: ${matchId}`);
		ws.send(
			JSON.stringify(
				createMessage("error", {
					code: "NOT_IN_MATCH",
					message: "You are not in this match",
				})
			)
		);
		return;
	}
	const players = matchPlayers.get(matchId);
	console.log(`[WS] Broadcasting media to ${players?.size ?? 0} players in match ${matchId} (excluding sender)`);

	broadcast(matchId, message, ws.data.id);

	console.log(`[WS] Media uploaded in match ${matchId}: ${media.name} by ${media.uploadedBy.username}`);
}

function handleMediaRemoved(ws: ServerWebSocket<WebSocketData>, message: MediaRemovedMessage) {
	const { matchId, mediaId } = message.payload;

	if (ws.data.matchId !== matchId) {
		ws.send(
			JSON.stringify(
				createMessage("error", {
					code: "NOT_IN_MATCH",
					message: "You are not in this match",
				})
			)
		);
		return;
	}

	broadcast(matchId, message, ws.data.id);

	console.log(`[WS] Media removed in match ${matchId}: ${mediaId}`);
}

function handleMessage(ws: ServerWebSocket<WebSocketData>, rawMessage: string | Buffer | ArrayBuffer) {
	try {
		const msgStr =
			typeof rawMessage === "string"
				? rawMessage
				: rawMessage instanceof Buffer
				? rawMessage.toString("utf-8")
				: new TextDecoder().decode(rawMessage);
		const message = JSON.parse(msgStr) as WSMessage;

		ws.data.lastPing = Date.now();

		if (isPingMessage(message)) {
			ws.send(JSON.stringify(createMessage("pong")));
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

		if (message.type === "subscribe_lobbies") {
			handleSubscribeLobbies(ws);
			return;
		}

		if (message.type === "unsubscribe_lobbies") {
			handleUnsubscribeLobbies(ws);
			return;
		}

		console.log(`[WS] Unknown message type: ${message.type}`);
	} catch (error) {
		console.error("[WS] Failed to parse message:", error);
		ws.send(
			JSON.stringify(
				createMessage("error", {
					code: "INVALID_MESSAGE",
					message: "Failed to parse message",
				})
			)
		);
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

		broadcast(matchId, createMessage("player_left", { matchId, userId }));
	}

	console.log(`[WS] Connection closed: ${id} (user: ${username || "unknown"})`);
}

async function notifyLobbyChange() {
	if (lobbySubscribers.size === 0) return;

	const lobbies = await fetchLobbies();
	broadcastToLobbySubscribers(createMessage("lobbies_update", { lobbies }));
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

			if (providedKey !== WS_API_KEY) {
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

			if (providedKey !== WS_API_KEY) {
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
						broadcast(
							matchId,
							createMessage("match_status", {
								matchId,
								status,
								timeRemaining,
								playerCount: players.size,
							})
						);
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
