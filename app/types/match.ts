import { TimelineState, Clip } from "./timeline";

export type MatchStatus = "preparing" | "active" | "completing" | "rendering" | "completed" | "failed";

export interface MatchConfig {
	timelineDuration: number;
	matchDuration: number;
	maxPlayers: number;
	clipSizeMin: number;
	clipSizeMax: number;
	audioMaxDb: number;
	maxVideoTracks: number;
	maxAudioTracks: number;
	maxClipsPerUser: number;
	constraints: string[];
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
	timelineDuration: 30,
	matchDuration: 3,
	maxPlayers: 100,
	clipSizeMin: 0.5,
	clipSizeMax: 10,
	audioMaxDb: 6,
	maxVideoTracks: 20,
	maxAudioTracks: 20,
	maxClipsPerUser: 10,
	constraints: [],
};

export interface MatchPlayer {
	id: string;
	username: string;
	image?: string | null;
	joinedAt: Date;
	disconnectedAt: Date | null;
	clipCount: number;
}

export interface Match {
	id: string;
	lobbyId: string;
	lobbyName: string;
	status: MatchStatus;
	config: MatchConfig;
	players: MatchPlayer[];
	timeline: TimelineState;
	startedAt: Date | null;
	endsAt: Date | null;
	completedAt: Date | null;
	renderJobId: string | null;
	renderUrl: string | null;
	renderError: string | null;
	editCount: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface StartMatchRequest {
	lobbyId: string;
}

export interface StartMatchResponse {
	success: boolean;
	matchId?: string;
	message: string;
}

export interface MatchStatusResponse {
	matchId: string;
	status: MatchStatus;
	timeRemaining: number | null;
	playerCount: number;
	clipCount: number;
}

export interface AddClipRequest {
	playerId: string;
	clip: Clip;
	trackId: string;
}

export interface AddClipResponse {
	success: boolean;
	message: string;
	clipId?: string;
}

export interface UpdateClipRequest {
	playerId: string;
	clipId: string;
	trackId: string;
	updates: Partial<Clip>;
}

export interface UpdateClipResponse {
	success: boolean;
	message: string;
}

export interface RemoveClipRequest {
	playerId: string;
	clipId: string;
	trackId: string;
}

export interface RemoveClipResponse {
	success: boolean;
	message: string;
}

export interface MatchStateResponse {
	match: Match;
	timeline: TimelineState;
	timeRemaining: number | null;
}

export interface ClipEditOperation {
	id: string;
	matchId: string;
	playerId: string;
	type: "add" | "update" | "remove";
	clipId: string;
	trackId: string;
	clipData: Clip | null;
	previousData: Clip | null;
	timestamp: Date;
}
