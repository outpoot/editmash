import type { ServerWebSocket } from "bun";

export interface ClientZone {
	startTime: number;
	endTime: number;
}

export interface WebSocketData {
	id: string;
	matchId: string | null;
	userId: string | null;
	username: string | null;
	subscribedToLobbies: boolean;
	connectedAt: number;
	lastPing: number;
	zone: ClientZone | null;
}

export type TimelineClip = {
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

export type CachedTimeline = {
	duration: number;
	tracks: Array<{
		id: string;
		type: "video" | "audio";
		clips: TimelineClip[];
	}>;
};

export interface ClipIdMap {
	fullToShort: Map<string, number>;
	shortToFull: Map<number, { fullId: string; trackId: string }>;
	nextShortId: number;
}

export interface MatchConfigCache {
	timelineDuration: number;
	clipSizeMin: number;
	clipSizeMax: number;
	audioMaxDb: number;
	maxVideoTracks: number;
	maxAudioTracks: number;
	maxClipsPerUser: number;
	constraints: string[];
}

export interface PlayerClipCount {
	userId: string;
	clipCount: number;
}

export const PORT = parseInt(process.env.WS_PORT || "3001", 10);
export const IDLE_TIMEOUT = 120; // seconds
export const WS_API_KEY = process.env.WS_API_KEY;
export const TIMELINE_SYNC_DELAY = 3000; // 3 second debounce for timeline sync to DB
export const ZONE_BUFFER = 2; // zone boundaries buffer for seamless playback
export const BATCH_WINDOW_MS = 50; // ms for batching clip updates

export const matchPlayers = new Map<string, Set<string>>();

export const connections = new Map<string, ServerWebSocket<WebSocketData>>();

export const lobbySubscribers = new Set<string>();

export const matchTimelines = new Map<string, CachedTimeline>();

export const pendingTimelineSyncs = new Map<string, ReturnType<typeof setTimeout>>();

export const matchClipIdMaps = new Map<string, ClipIdMap>();

export const matchConfigs = new Map<string, MatchConfigCache>();

export const matchPlayerClipCounts = new Map<string, Map<string, number>>();

export const pendingBatches = new Map<
	string,
	{
		updates: Map<string, { shortId: number; trackId: string; changes: Partial<TimelineClip> }>;
		timeout: ReturnType<typeof setTimeout>;
		userId: string;
		username: string;
	}
>();

export function generateConnectionId(): string {
	return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
