import type { WSMessage } from "@/websocket/types";
import { serializeMessage, deserializeMessage, createJoinMatchMessage } from "@/websocket/types";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "failed" | "kicked";
type MessageHandler = (message: WSMessage) => void;
type StatusHandler = (status: ConnectionStatus) => void;

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const RECONNECT_MAX_ATTEMPTS = 10;
const FAILED_RETRY_DELAY = 60000;

interface MatchConnection {
	matchId: string;
	userId: string;
	username: string;
	userImage?: string;
	highlightColor: string;
	ws: WebSocket | null;
	status: ConnectionStatus;
	reconnectTimeout: ReturnType<typeof setTimeout> | null;
	disconnectTimeout: ReturnType<typeof setTimeout> | null;
	messageHandlers: Set<MessageHandler>;
	statusHandlers: Set<StatusHandler>;
	refCount: number;
	reconnectAttempt: number;
	maxReconnectAttempts: number;
}

const connections = new Map<string, MatchConnection>();

function getOrCreateConnection(matchId: string, userId: string, username: string, userImage?: string, highlightColor?: string): MatchConnection {
	const key = `${matchId}:${userId}`;
	let conn = connections.get(key);

	if (!conn) {
		conn = {
			matchId,
			userId,
			username,
			userImage,
			highlightColor: highlightColor || "#3b82f6",
			ws: null,
			status: "disconnected",
			reconnectTimeout: null,
			disconnectTimeout: null,
			messageHandlers: new Set(),
			statusHandlers: new Set(),
			refCount: 0,
			reconnectAttempt: 0,
			maxReconnectAttempts: RECONNECT_MAX_ATTEMPTS,
		};
		connections.set(key, conn);
	}

	if (conn.disconnectTimeout) {
		clearTimeout(conn.disconnectTimeout);
		conn.disconnectTimeout = null;
	}

	if (conn.status === "failed") {
		conn.status = "disconnected";
		conn.reconnectAttempt = 0;
	}

	return conn;
}

function setStatus(conn: MatchConnection, status: ConnectionStatus) {
	conn.status = status;
	conn.statusHandlers.forEach((handler) => handler(status));
}

function connect(conn: MatchConnection) {
	const url = process.env.NEXT_PUBLIC_WS_URL;
	if (!url) {
		console.error("[WS] NEXT_PUBLIC_WS_URL is not configured");
		return;
	}

	if (conn.ws?.readyState === WebSocket.OPEN || conn.ws?.readyState === WebSocket.CONNECTING) {
		return;
	}

	if (conn.status === "failed") {
		return;
	}

	console.log(`[WS:${conn.matchId.slice(0, 8)}] Connecting... (attempt ${conn.reconnectAttempt + 1}/${conn.maxReconnectAttempts})`);
	setStatus(conn, "connecting");

	const ws = new WebSocket(url);
	ws.binaryType = "arraybuffer";
	conn.ws = ws;

	ws.onopen = () => {
		if (conn.ws !== ws) {
			ws.close();
			return;
		}
		console.log(`[WS:${conn.matchId.slice(0, 8)}] Connected`);

		conn.reconnectAttempt = 0;
		if (conn.reconnectTimeout) {
			clearTimeout(conn.reconnectTimeout);
			conn.reconnectTimeout = null;
		}

		setStatus(conn, "connected");

		if (ws.readyState === WebSocket.OPEN) {
			try {
				const msg = createJoinMatchMessage(conn.matchId, conn.userId, conn.username, conn.userImage, conn.highlightColor);
				ws.send(serializeMessage(msg));
			} catch (error) {
				console.error(`[WS:${conn.matchId.slice(0, 8)}] Failed to send join message:`, error, {
					matchId: conn.matchId,
					userId: conn.userId,
					username: conn.username,
				});

				ws.close();
			}
		} else {
			console.error(`[WS:${conn.matchId.slice(0, 8)}] Socket not open after onopen, readyState: ${ws.readyState}`);
			ws.close();
		}
	};

	ws.onmessage = (event) => {
		if (conn.ws !== ws) return;
		try {
			const message = deserializeMessage(event.data);
			conn.messageHandlers.forEach((handler) => handler(message));
		} catch (e) {
			console.error("[WS] Parse error:", e);
		}
	};

	ws.onclose = (event) => {
		if (conn.ws !== ws) return;
		console.log(`[WS:${conn.matchId.slice(0, 8)}] Disconnected (code: ${event.code}, reason: ${event.reason})`);
		conn.ws = null;

		if (event.code === 4000) {
			setStatus(conn, "kicked");
			return;
		}

		if (conn.refCount > 0) {
			conn.reconnectAttempt++;

			if (conn.reconnectAttempt >= conn.maxReconnectAttempts) {
				console.error(`[WS:${conn.matchId.slice(0, 8)}] Max reconnection attempts (${conn.maxReconnectAttempts}) reached. Retrying in ${FAILED_RETRY_DELAY / 1000}s...`);
				setStatus(conn, "failed");
				conn.reconnectTimeout = setTimeout(() => {
					if (conn.refCount > 0 && conn.status === "failed") {
						console.log(`[WS:${conn.matchId.slice(0, 8)}] Retrying after failed state...`);
						conn.status = "disconnected";
						conn.reconnectAttempt = 0;
						connect(conn);
					}
				}, FAILED_RETRY_DELAY);
				return;
			}

			const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, conn.reconnectAttempt - 1), RECONNECT_MAX_DELAY);
			console.log(`[WS:${conn.matchId.slice(0, 8)}] Reconnecting in ${delay}ms...`);

			setStatus(conn, "disconnected");
			conn.reconnectTimeout = setTimeout(() => connect(conn), delay);
		} else {
			setStatus(conn, "disconnected");
		}
	};

	ws.onerror = () => {
		// silent ignore because onclose will be called next
	};
}

function disconnect(conn: MatchConnection) {
	if (conn.reconnectTimeout) {
		clearTimeout(conn.reconnectTimeout);
		conn.reconnectTimeout = null;
	}
	if (conn.disconnectTimeout) {
		clearTimeout(conn.disconnectTimeout);
		conn.disconnectTimeout = null;
	}
	if (conn.ws) {
		conn.ws.close();
		conn.ws = null;
	}
	setStatus(conn, "disconnected");
}

export function subscribeToMatch(
	matchId: string,
	userId: string,
	username: string,
	userImage: string | undefined,
	highlightColor: string,
	onMessage: MessageHandler,
	onStatus: StatusHandler
): () => void {
	const conn = getOrCreateConnection(matchId, userId, username, userImage, highlightColor);

	conn.messageHandlers.add(onMessage);
	conn.statusHandlers.add(onStatus);
	conn.refCount++;

	onStatus(conn.status);

	if (conn.refCount === 1) {
		connect(conn);
	}

	return () => {
		conn.messageHandlers.delete(onMessage);
		conn.statusHandlers.delete(onStatus);
		conn.refCount--;

		if (conn.refCount === 0) {
			conn.disconnectTimeout = setTimeout(() => {
				if (conn.refCount === 0) {
					disconnect(conn);
					connections.delete(`${matchId}:${userId}`);
				}
			}, 100);
		}
	};
}

export function sendMessage(matchId: string, userId: string, message: WSMessage): boolean {
	const key = `${matchId}:${userId}`;
	const conn = connections.get(key);

	if (!conn?.ws || conn.ws.readyState !== WebSocket.OPEN) {
		return false;
	}

	try {
		conn.ws.send(serializeMessage(message));
		return true;
	} catch (error) {
		console.error(`[WS:${matchId.slice(0, 8)}] Send failed:`, error);

		conn.ws = null;
		setStatus(conn, "disconnected");

		if (conn.refCount === 0) {
			connections.delete(key);
		} else {
			connect(conn);
		}

		return false;
	}
}

export function getConnectionStatus(matchId: string, userId: string): ConnectionStatus {
	const key = `${matchId}:${userId}`;
	return connections.get(key)?.status ?? "disconnected";
}
