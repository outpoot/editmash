export type WSMessageType =
	| "ping"
	| "pong"
	| "join_match"
	| "leave_match"
	| "media_uploaded"
	| "media_removed"
	| "timeline_update"
	| "player_joined"
	| "player_left"
	| "player_count"
	| "match_status"
	| "error"
	// Lobby messages
	| "subscribe_lobbies"
	| "unsubscribe_lobbies"
	| "lobbies_update"
	| "lobby_created"
	| "lobby_updated"
	| "lobby_deleted";

export interface WSMessage {
	type: WSMessageType;
	payload?: unknown;
	timestamp: number;
}

export interface JoinMatchMessage extends WSMessage {
	type: "join_match";
	payload: {
		matchId: string;
		userId: string;
		username: string;
	};
}

export interface LeaveMatchMessage extends WSMessage {
	type: "leave_match";
	payload: {
		matchId: string;
		userId: string;
	};
}

export interface MediaUploadedMessage extends WSMessage {
	type: "media_uploaded";
	payload: {
		matchId: string;
		media: {
			id: string;
			name: string;
			type: "video" | "audio" | "image";
			url: string;
			uploadedBy: {
				userId: string;
				username: string;
			};
		};
	};
}

export interface MediaRemovedMessage extends WSMessage {
	type: "media_removed";
	payload: {
		matchId: string;
		mediaId: string;
		removedBy: string;
	};
}

export interface PlayerJoinedMessage extends WSMessage {
	type: "player_joined";
	payload: {
		matchId: string;
		player: {
			userId: string;
			username: string;
		};
	};
}

export interface PlayerLeftMessage extends WSMessage {
	type: "player_left";
	payload: {
		matchId: string;
		userId: string;
	};
}

export interface PlayerCountMessage extends WSMessage {
	type: "player_count";
	payload: {
		matchId: string;
		count: number;
	};
}

export interface MatchStatusMessage extends WSMessage {
	type: "match_status";
	payload: {
		matchId: string;
		status: string;
		timeRemaining: number | null;
		playerCount: number;
	};
}

export interface ErrorMessage extends WSMessage {
	type: "error";
	payload: {
		code: string;
		message: string;
	};
}

export interface PingMessage extends WSMessage {
	type: "ping";
}

export interface PongMessage extends WSMessage {
	type: "pong";
}

// Lobby types
export interface LobbyInfo {
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
}

export interface SubscribeLobbiesMessage extends WSMessage {
	type: "subscribe_lobbies";
}

export interface UnsubscribeLobbiesMessage extends WSMessage {
	type: "unsubscribe_lobbies";
}

export interface LobbiesUpdateMessage extends WSMessage {
	type: "lobbies_update";
	payload: {
		lobbies: LobbyInfo[];
	};
}

export interface LobbyCreatedMessage extends WSMessage {
	type: "lobby_created";
	payload: {
		lobby: LobbyInfo;
	};
}

export interface LobbyUpdatedMessage extends WSMessage {
	type: "lobby_updated";
	payload: {
		lobby: LobbyInfo;
	};
}

export interface LobbyDeletedMessage extends WSMessage {
	type: "lobby_deleted";
	payload: {
		lobbyId: string;
	};
}

export function isJoinMatchMessage(msg: WSMessage): msg is JoinMatchMessage {
	return msg.type === "join_match";
}

export function isLeaveMatchMessage(msg: WSMessage): msg is LeaveMatchMessage {
	return msg.type === "leave_match";
}

export function isMediaUploadedMessage(msg: WSMessage): msg is MediaUploadedMessage {
	return msg.type === "media_uploaded";
}

export function isMediaRemovedMessage(msg: WSMessage): msg is MediaRemovedMessage {
	return msg.type === "media_removed";
}

export function isPingMessage(msg: WSMessage): msg is PingMessage {
	return msg.type === "ping";
}

type AllMessages =
	| JoinMatchMessage
	| LeaveMatchMessage
	| MediaUploadedMessage
	| MediaRemovedMessage
	| PlayerJoinedMessage
	| PlayerLeftMessage
	| PlayerCountMessage
	| MatchStatusMessage
	| ErrorMessage
	| PingMessage
	| PongMessage
	| SubscribeLobbiesMessage
	| UnsubscribeLobbiesMessage
	| LobbiesUpdateMessage
	| LobbyCreatedMessage
	| LobbyUpdatedMessage
	| LobbyDeletedMessage;

type MessageByType<T extends AllMessages["type"]> = Extract<AllMessages, { type: T }>;

type PayloadByType<T extends AllMessages["type"]> = MessageByType<T> extends { payload: infer P } ? P : undefined;

export function createMessage<T extends AllMessages["type"]>(
	type: T,
	...args: PayloadByType<T> extends undefined ? [] : [payload: PayloadByType<T>]
): MessageByType<T>;

export function createMessage<T extends AllMessages["type"]>(type: T, payload?: PayloadByType<T>): MessageByType<T> {
	const msg: WSMessage = {
		type,
		timestamp: Date.now(),
	};
	if (payload !== undefined) {
		msg.payload = payload;
	}
	return msg as MessageByType<T>;
}
