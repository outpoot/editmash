export interface VideoClipProperties {
	position: { x: number; y: number };
	size: { width: number; height: number };
}

export interface AudioClipProperties {
	volume: number;
}

export interface BaseClip {
	id: string;
	src: string;
	startTime: number;
	duration: number;
}

export interface VideoClip extends BaseClip {
	type: "video";
	properties: VideoClipProperties;
}

export interface AudioClip extends BaseClip {
	type: "audio";
	properties: AudioClipProperties;
}

export type Clip = VideoClip | AudioClip;

export interface Track {
	id: string;
	type: "video" | "audio";
	clips: Clip[];
}

export interface TimelineState {
	duration: number;
	tracks: Track[];
}

export interface PlaybackState {
	isPlaying: boolean;
	currentTime: number;
}

export interface DragState {
	clipId: string;
	trackId: string;
	type: "move" | "trim-start" | "trim-end";
	startX: number;
	startY: number;
	startTime: number;
	startDuration: number;
	originalTrackId: string;
	currentTrackId: string;
	hasMoved: boolean;
}
