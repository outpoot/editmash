import { MatchConfig } from "./match";

export type LobbyStatus = "waiting" | "starting" | "in_match" | "closed";

export interface LobbyPlayer {
	id: string;
	username: string;
	joinedAt: Date;
	isHost: boolean;
	isReady: boolean;
}

export interface Lobby {
	id: string;
	name: string;
	joinCode: string;
	status: LobbyStatus;
	hostPlayerId: string;
	matchConfig: MatchConfig;
	players: LobbyPlayer[];
	matchId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateLobbyRequest {
	name: string;
	matchConfig: Partial<MatchConfig>;
	hostPlayerId: string;
	hostUsername: string;
}

export interface CreateLobbyResponse {
	lobbyId: string;
	joinCode: string;
}

export interface JoinLobbyRequest {
	playerId: string;
	username: string;
}

export interface JoinLobbyResponse {
	success: boolean;
	message: string;
	lobby?: Lobby;
}

export interface LeaveLobbyRequest {
	playerId: string;
}

export interface LeaveLobbyResponse {
	success: boolean;
	message: string;
}

export interface LobbyListItem {
	id: string;
	name: string;
	joinCode: string;
	status: LobbyStatus;
	playerCount: number;
	maxPlayers: number;
	hostUsername: string;
	createdAt: Date;
}

export interface LobbyListItemWithConfig extends LobbyListItem {
	matchConfig: MatchConfig;
}

export interface LobbyListResponse {
	lobbies: LobbyListItemWithConfig[];
	total: number;
}
