import {
	matchPlayers,
	connections,
	lobbySubscribers,
	pendingTimelineSyncs,
	TIMELINE_SYNC_DELAY,
	ZONE_BUFFER,
	type WebSocketData,
	type ClientZone,
} from "./state";
import { type WSMessage, serializeMessage, createRequestTimelineSyncMessage } from "./types";

export function broadcast(matchId: string, message: WSMessage, excludeConnectionId?: string): void {
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

export function clipInZone(clipStartTime: number, clipDuration: number, zone: ClientZone | null): boolean {
	if (!zone) return true;
	const clipEndTime = clipStartTime + clipDuration;
	const zoneStart = zone.startTime - ZONE_BUFFER;
	const zoneEnd = zone.endTime + ZONE_BUFFER;

	return clipStartTime < zoneEnd && clipEndTime > zoneStart;
}

export function broadcastClipMessage(
	matchId: string,
	message: WSMessage,
	clipStartTime: number | undefined,
	clipDuration: number | undefined,
	excludeConnectionId?: string
): void {
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

export function broadcastToLobbySubscribers(message: WSMessage, excludeConnectionId?: string): void {
	const msgBytes = serializeMessage(message);

	for (const connId of lobbySubscribers) {
		if (excludeConnectionId && connId === excludeConnectionId) continue;

		const ws = connections.get(connId);
		if (ws && ws.readyState === 1) {
			ws.send(msgBytes);
		}
	}
}

export function requestTimelineSync(matchId: string): void {
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
