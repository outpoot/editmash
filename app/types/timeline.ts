export interface VideoClipProperties {
	position: { x: number; y: number };
	size: { width: number; height: number };
	zoom: { x: number; y: number; linked: boolean };
	rotation: number;
	flip: { horizontal: boolean; vertical: boolean };
	crop: { left: number; right: number; top: number; bottom: number; softness: number };
	speed: number;
	freezeFrame: boolean;
	freezeFrameTime: number;
}

export interface AudioClipProperties {
	volume: number;
	pan: number; // -1 (left) to 1 (right)
	pitch: number; // semitones (-24 to 24)
	speed: number;
}

export interface BaseClip {
	id: string;
	name: string;
	src: string;
	startTime: number; // position on timeline
	duration: number; // duration on timeline (can be affected by speed)
	sourceIn: number; // offset into the source video file
	sourceDuration: number;
	thumbnail?: string;
	isLoading?: boolean;
	mediaId?: string;
}

export interface VideoClip extends BaseClip {
	type: "video";
	properties: VideoClipProperties;
}

export interface ImageClip extends BaseClip {
	type: "image";
	properties: VideoClipProperties;
}

export interface AudioClip extends BaseClip {
	type: "audio";
	properties: AudioClipProperties;
}

export type Clip = VideoClip | ImageClip | AudioClip;

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
	startScrollLeft: number;
	startTime: number;
	startDuration: number;
	originalSourceIn: number;
	originalTrackId: string;
	currentTrackId: string;
	hasMoved: boolean;
}
