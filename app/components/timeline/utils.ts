import { TimelineState, Clip, VideoClip, ImageClip, AudioClip } from "../../types/timeline";
import { generateThumbnail } from "../../store/mediaStore";

export function clipsEqual(a: Clip, b: Clip): boolean {
	const { thumbnail: _a, ...aRest } = a as Clip & { thumbnail?: string };
	const { thumbnail: _b, ...bRest } = b as Clip & { thumbnail?: string };
	return JSON.stringify(aRest) === JSON.stringify(bRest);
}

export function generateAndUpdateThumbnail(clip: Clip, setTimelineState: React.Dispatch<React.SetStateAction<TimelineState>>) {
	if ((clip.type === "video" || clip.type === "image") && !clip.thumbnail && clip.src) {
		if (clip.type === "video") {
			const video = document.createElement("video");
			video.crossOrigin = "anonymous";
			video.preload = "metadata";
			video.src = clip.src;
			video.currentTime = 0.1;
			video.onseeked = () => {
				const thumbnail = generateThumbnail(video, video.videoWidth, video.videoHeight);
				if (thumbnail) {
					setTimelineState((prev) => ({
						...prev,
						tracks: prev.tracks.map((t) => ({
							...t,
							clips: t.clips.map((c) => (c.id === clip.id ? { ...c, thumbnail } : c)),
						})),
					}));
				}
				video.src = "";
			};
			video.onerror = () => {
				video.src = "";
			};
		} else {
			const img = document.createElement("img");
			img.crossOrigin = "anonymous";
			img.src = clip.src;
			img.onload = () => {
				const thumbnail = generateThumbnail(img, img.naturalWidth, img.naturalHeight);
				if (thumbnail) {
					setTimelineState((prev) => ({
						...prev,
						tracks: prev.tracks.map((t) => ({
							...t,
							clips: t.clips.map((c) => (c.id === clip.id ? { ...c, thumbnail } : c)),
						})),
					}));
				}
			};
		}
	}
}

export const initialTimelineState: TimelineState = {
	duration: 60,
	tracks: [
		{ id: "video-0", type: "video", clips: [] },
		{ id: "video-1", type: "video", clips: [] },
		{ id: "audio-0", type: "audio", clips: [] },
	],
};

export interface PlacementResult {
	state: TimelineState;
	removedClips: Array<{ trackId: string; clipId: string }>;
	updatedClips: Array<{ trackId: string; clip: Clip }>;
	addedClips: Array<{ trackId: string; clip: Clip }>;
}

export function placeClipOnTimeline(clip: Clip, trackId: string, state: TimelineState): PlacementResult {
	const newState = {
		...state,
		tracks: state.tracks.map((t) => ({
			...t,
			clips: [...t.clips],
		})),
	};
	const track = newState.tracks.find((t) => t.id === trackId);
	if (!track) return { state, removedClips: [], updatedClips: [], addedClips: [] };

	const removedClips: Array<{ trackId: string; clipId: string }> = [];
	const updatedClips: Array<{ trackId: string; clip: Clip }> = [];
	const addedClips: Array<{ trackId: string; clip: Clip }> = [];

	const clipEnd = clip.startTime + clip.duration;
	const otherClips = track.clips.filter((c) => c.id !== clip.id);

	// find overlapping clips
	const overlaps = otherClips.filter((c) => {
		const cStart = c.startTime;
		const cEnd = c.startTime + c.duration;
		return clip.startTime < cEnd && clipEnd > cStart;
	});

	if (overlaps.length === 0) {
		// no overlaps - just place the clip
		return { state: newState, removedClips, updatedClips, addedClips };
	}

	for (const overlappingClip of overlaps) {
		const overlapStart = overlappingClip.startTime;
		const overlapEnd = overlappingClip.startTime + overlappingClip.duration;

		// case 1: new clip completely covers the overlapping clip - remove it
		if (clip.startTime <= overlapStart && clipEnd >= overlapEnd) {
			const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
			newState.tracks[trackIndex].clips = newState.tracks[trackIndex].clips.filter((c) => c.id !== overlappingClip.id);
			removedClips.push({ trackId, clipId: overlappingClip.id });
		}
		// case 2: new clip is in the middle of overlapping clip - split it
		else if (clip.startTime > overlapStart && clipEnd < overlapEnd) {
			const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
			const clipIndex = newState.tracks[trackIndex].clips.findIndex((c) => c.id === overlappingClip.id);

			// create left part
			const leftPart = { ...overlappingClip };
			leftPart.duration = clip.startTime - overlapStart;

			// calculate source offset for right part
			const timelineOffset = clipEnd - overlapStart;
			const speed = overlappingClip.type === "video" ? (overlappingClip as VideoClip).properties.speed : 1;
			const sourceOffset = timelineOffset * speed;

			// create right part
			const rightPart: Clip = {
				...overlappingClip,
				id: `${overlappingClip.id}-split-${Date.now()}`,
				startTime: clipEnd,
				duration: overlapEnd - clipEnd,
				sourceIn: overlappingClip.sourceIn + sourceOffset,
			};

			// replace original with left part and add right part
			newState.tracks[trackIndex].clips[clipIndex] = leftPart;
			newState.tracks[trackIndex].clips.push(rightPart);
			updatedClips.push({ trackId, clip: leftPart });
			addedClips.push({ trackId, clip: rightPart });
		}
		// case 3: new clip overlaps the start - trim overlapping clip from start
		else if (clip.startTime <= overlapStart && clipEnd > overlapStart && clipEnd < overlapEnd) {
			const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
			const clipIndex = newState.tracks[trackIndex].clips.findIndex((c) => c.id === overlappingClip.id);

			const trimmed = { ...overlappingClip };
			const trimAmount = clipEnd - overlapStart;
			const speed = overlappingClip.type === "video" ? (overlappingClip as VideoClip).properties.speed : 1;
			const sourceOffset = trimAmount * speed;
			trimmed.startTime = clipEnd;
			trimmed.duration = overlappingClip.duration - trimAmount;
			trimmed.sourceIn = overlappingClip.sourceIn + sourceOffset;

			newState.tracks[trackIndex].clips[clipIndex] = trimmed;
			updatedClips.push({ trackId, clip: trimmed });
		}
		// case 4: new clip overlaps the end - trim overlapping clip from end
		else if (clip.startTime > overlapStart && clip.startTime < overlapEnd && clipEnd >= overlapEnd) {
			const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
			const clipIndex = newState.tracks[trackIndex].clips.findIndex((c) => c.id === overlappingClip.id);

			const trimmed = { ...overlappingClip };
			trimmed.duration = clip.startTime - overlapStart;

			newState.tracks[trackIndex].clips[clipIndex] = trimmed;
			updatedClips.push({ trackId, clip: trimmed });
		}
	}

	return { state: newState, removedClips, updatedClips, addedClips };
}

export interface SnapCalculationOptions {
	isSnappingEnabled: boolean;
	snapPoints: number[];
	currentTimeRef: React.RefObject<number>;
}

export function calculateSnappedTime(targetTime: number, clipId: string, clipDuration: number, options: SnapCalculationOptions): number {
	if (!options.isSnappingEnabled) return targetTime;

	const snapThreshold = 0.15; // 150ms
	let closestSnapPoint: number | null = null;
	let minDistance = snapThreshold;

	const clipEnd = targetTime + clipDuration;
	const snapPoints = [...options.snapPoints, options.currentTimeRef.current];

	for (let i = 0; i < snapPoints.length; i++) {
		const snapPoint = snapPoints[i];
		const distance = Math.abs(targetTime - snapPoint);
		if (distance < minDistance) {
			minDistance = distance;
			closestSnapPoint = snapPoint;
		}
	}

	for (let i = 0; i < snapPoints.length; i++) {
		const snapPoint = snapPoints[i];
		const distance = Math.abs(clipEnd - snapPoint);
		if (distance < minDistance) {
			minDistance = distance;
			closestSnapPoint = snapPoint - clipDuration;
		}
	}

	return closestSnapPoint !== null ? closestSnapPoint : targetTime;
}

export function calculatePlayheadSnappedTime(targetTime: number, isSnappingEnabled: boolean, snapPoints: number[]): number {
	if (!isSnappingEnabled) return targetTime;

	const snapThreshold = 0.15; // 150ms
	let closestSnapPoint: number | null = null;
	let minDistance = snapThreshold;

	for (let i = 0; i < snapPoints.length; i++) {
		const snapPoint = snapPoints[i];
		const distance = Math.abs(targetTime - snapPoint);
		if (distance < minDistance) {
			minDistance = distance;
			closestSnapPoint = snapPoint;
		}
	}

	return closestSnapPoint !== null ? closestSnapPoint : targetTime;
}

export function getTrackAtY(clientY: number, trackRefsMap: React.RefObject<Map<string, HTMLDivElement>>): string | null {
	for (const [trackId, trackElement] of trackRefsMap.current.entries()) {
		const rect = trackElement.getBoundingClientRect();
		if (clientY >= rect.top && clientY <= rect.bottom) {
			return trackId;
		}
	}
	return null;
}

export function createNewClip(
	mediaItem: {
		id?: string;
		type: "video" | "audio" | "image";
		name: string;
		url: string;
		duration: number;
		thumbnail?: string;
		width?: number;
		height?: number;
		isDownloading?: boolean;
		isUploading?: boolean;
	},
	dropTime: number,
	clipDuration: number
): Clip {
	let clipWidth = 1920;
	let clipHeight = 1080;
	let clipX = 0;
	let clipY = 0;

	if ((mediaItem.type === "video" || mediaItem.type === "image") && mediaItem.width && mediaItem.height) {
		const mediaAspect = mediaItem.width / mediaItem.height;
		const canvasAspect = 1920 / 1080;

		if (mediaAspect > canvasAspect) {
			clipWidth = 1920;
			clipHeight = 1920 / mediaAspect;
			clipX = 0;
			clipY = (1080 - clipHeight) / 2;
		} else {
			clipHeight = 1080;
			clipWidth = 1080 * mediaAspect;
			clipX = (1920 - clipWidth) / 2;
			clipY = 0;
		}
	}

	const isLoading = mediaItem.isDownloading || mediaItem.isUploading;

	const baseClip = {
		id: `clip-${Date.now()}-${Math.random()}`,
		name: mediaItem.name,
		src: mediaItem.url,
		startTime: dropTime,
		duration: clipDuration,
		sourceIn: 0,
		sourceDuration: mediaItem.duration,
		thumbnail: mediaItem.thumbnail,
		mediaId: mediaItem.id,
		isLoading: isLoading || undefined,
	};

	if (mediaItem.type === "video") {
		return {
			...baseClip,
			type: "video",
			properties: {
				position: { x: clipX, y: clipY },
				size: { width: clipWidth, height: clipHeight },
				zoom: { x: 1, y: 1, linked: true },
				rotation: 0,
				flip: { horizontal: false, vertical: false },
				crop: { left: 0, right: 0, top: 0, bottom: 0, softness: 0 },
				speed: 1,
				freezeFrame: false,
				freezeFrameTime: 0,
			},
		} as VideoClip;
	} else if (mediaItem.type === "image") {
		return {
			...baseClip,
			type: "image",
			properties: {
				position: { x: clipX, y: clipY },
				size: { width: clipWidth, height: clipHeight },
				zoom: { x: 1, y: 1, linked: true },
				rotation: 0,
				flip: { horizontal: false, vertical: false },
				crop: { left: 0, right: 0, top: 0, bottom: 0, softness: 0 },
				speed: 1,
				freezeFrame: false,
				freezeFrameTime: 0,
			},
		} as ImageClip;
	} else {
		return {
			...baseClip,
			type: "audio",
			properties: {
				volume: 1.0,
				pan: 0,
				pitch: 0,
				speed: 1,
			},
		} as AudioClip;
	}
}
