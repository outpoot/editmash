import { useState, useRef, useCallback, useEffect } from "react";
import { TimelineState, Clip, DragState } from "../types/timeline";
import { getTrackAtY, placeClipOnTimeline, calculateSnappedTime, SnapCalculationOptions } from "../components/timeline/utils";

interface UseTimelineDragOptions {
	pixelsPerSecond: number;
	timelineState: TimelineState;
	setTimelineState: React.Dispatch<React.SetStateAction<TimelineState>>;
	updateTimelineState: (updater: (prev: TimelineState) => TimelineState) => void;
	scrollContainerRef: React.RefObject<HTMLDivElement | null>;
	trackRefsMap: React.RefObject<Map<string, HTMLDivElement>>;
	selectedClips: Array<{ clipId: string; trackId: string }>;
	setSelectedClips: React.Dispatch<React.SetStateAction<Array<{ clipId: string; trackId: string }>>>;
	setLastSelectedClip: React.Dispatch<React.SetStateAction<{ clipId: string; trackId: string } | null>>;
	isSnappingEnabled: boolean;
	snapPointsCache: number[];
	currentTimeRef: React.RefObject<number>;
	onClipUpdated?: (trackId: string, clip: Clip) => void;
	onClipRemoved?: (trackId: string, clipId: string) => void;
	onClipAdded?: (trackId: string, clip: Clip) => void;
}

interface UseTimelineDragReturn {
	dragState: DragState | null;
	setDragState: React.Dispatch<React.SetStateAction<DragState | null>>;
	hoveredTrackId: string | null;
	setHoveredTrackId: React.Dispatch<React.SetStateAction<string | null>>;
	handleClipDragStart: (e: React.MouseEvent, clipId: string, trackId: string, type: "move" | "trim-start" | "trim-end") => void;
}

export function useTimelineDrag({
	pixelsPerSecond,
	timelineState,
	setTimelineState,
	updateTimelineState,
	scrollContainerRef,
	trackRefsMap,
	selectedClips,
	setSelectedClips,
	setLastSelectedClip,
	isSnappingEnabled,
	snapPointsCache,
	currentTimeRef,
	onClipUpdated,
	onClipRemoved,
	onClipAdded,
}: UseTimelineDragOptions): UseTimelineDragReturn {
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);

	const dragStateRef = useRef<DragState | null>(null);
	dragStateRef.current = dragState;

	const lastHoveredTrackRef = useRef<string | null>(null);
	const dragUpdateScheduledRef = useRef<boolean>(false);
	const pendingDragUpdateRef = useRef<{ deltaTime: number; currentTrackId: string } | null>(null);

	const timelineStateRef = useRef(timelineState);
	timelineStateRef.current = timelineState;
	const selectedClipsRef = useRef(selectedClips);
	selectedClipsRef.current = selectedClips;

	const snapOptions: SnapCalculationOptions = {
		isSnappingEnabled,
		snapPoints: snapPointsCache,
		currentTimeRef,
	};

	const handleClipDragStart = useCallback(
		(e: React.MouseEvent, clipId: string, trackId: string, type: "move" | "trim-start" | "trim-end") => {
			const currentSelectedClips = selectedClipsRef.current;
			const currentTimelineState = timelineStateRef.current;

			const isInSelection = currentSelectedClips.some((c) => c.clipId === clipId && c.trackId === trackId);
			if (!isInSelection) {
				setSelectedClips([{ clipId, trackId }]);
				setLastSelectedClip({ clipId, trackId });
			}

			const track = currentTimelineState.tracks.find((t) => t.id === trackId);
			const clip = track?.clips.find((c) => c.id === clipId);

			if (!clip) return;

			const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;

			setDragState({
				clipId,
				trackId,
				type,
				startX: e.clientX,
				startY: e.clientY,
				startScrollLeft: scrollLeft,
				startTime: clip.startTime,
				startDuration: clip.duration,
				originalSourceIn: clip.sourceIn,
				originalTrackId: trackId,
				currentTrackId: trackId,
				hasMoved: false,
			});
		},
		[scrollContainerRef, setSelectedClips, setLastSelectedClip]
	);

	useEffect(() => {
		if (!dragState) return;

		const handleMouseMove = (e: MouseEvent) => {
			const currentDragState = dragStateRef.current;
			if (!currentDragState) return;

			const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
			const scrollDelta = scrollLeft - currentDragState.startScrollLeft;
			const deltaX = e.clientX - currentDragState.startX + scrollDelta;
			const deltaY = Math.abs(e.clientY - currentDragState.startY);

			// 3px threshold to prevent accidental drags
			if (!currentDragState.hasMoved && Math.abs(deltaX) < 3 && deltaY < 3) {
				return;
			}

			// we moving
			if (!currentDragState.hasMoved) {
				setDragState((prev) => (prev ? { ...prev, hasMoved: true } : null));
			}

			const deltaTime = deltaX / pixelsPerSecond;

			let currentTrackId = currentDragState.trackId;
			if (currentDragState.type === "move") {
				const hoveredTrack = getTrackAtY(e.clientY, trackRefsMap);
				if (hoveredTrack) {
					currentTrackId = hoveredTrack;
					if (lastHoveredTrackRef.current !== hoveredTrack) {
						lastHoveredTrackRef.current = hoveredTrack;
						setHoveredTrackId(hoveredTrack);
					}
				}
			}

			pendingDragUpdateRef.current = { deltaTime, currentTrackId };

			if (!dragUpdateScheduledRef.current) {
				dragUpdateScheduledRef.current = true;
				requestAnimationFrame(() => {
					dragUpdateScheduledRef.current = false;
					const update = pendingDragUpdateRef.current;
					const latestDragState = dragStateRef.current;
					if (!update || !latestDragState) return;

					const { deltaTime, currentTrackId } = update;

					setTimelineState((prev) => {
						const newState = {
							...prev,
							tracks: prev.tracks.map((t) => ({
								...t,
								clips: [...t.clips],
							})),
						};

						const sourceTrackIndex = newState.tracks.findIndex((t) => t.id === latestDragState.trackId);
						if (sourceTrackIndex === -1) return prev;

						const clipIndex = newState.tracks[sourceTrackIndex].clips.findIndex((c) => c.id === latestDragState.clipId);
						if (clipIndex === -1) return prev;

						const clip = {
							...newState.tracks[sourceTrackIndex].clips[clipIndex],
						};

						if (latestDragState.type === "move") {
							let newStartTime = Math.max(0, latestDragState.startTime + deltaTime);
							newStartTime = Math.min(newStartTime, prev.duration - clip.duration);
							newStartTime = calculateSnappedTime(newStartTime, clip.id, clip.duration, snapOptions);
							clip.startTime = newStartTime;

							// handle cross-track movement
							if (currentTrackId !== latestDragState.trackId) {
								const targetTrackIndex = newState.tracks.findIndex((t) => t.id === currentTrackId);
								const targetTrack = newState.tracks[targetTrackIndex];

								const isCompatible =
									targetTrack &&
									((targetTrack.type === "video" && (clip.type === "video" || clip.type === "image")) ||
										(targetTrack.type === "audio" && clip.type === "audio"));

								if (isCompatible) {
									newState.tracks[sourceTrackIndex].clips = newState.tracks[sourceTrackIndex].clips.filter(
										(c) => c.id !== latestDragState.clipId
									);

									newState.tracks[targetTrackIndex].clips.push(clip);

									setDragState((prev) => (prev ? { ...prev, trackId: currentTrackId } : null));
								} else {
									newState.tracks[sourceTrackIndex].clips[clipIndex] = clip;
								}
							} else {
								// moving within same track - just update position
								newState.tracks[sourceTrackIndex].clips[clipIndex] = clip;
							}
						} else if (latestDragState.type === "trim-start") {
							const speed = clip.type === "video" ? clip.properties.speed : clip.type === "audio" ? clip.properties.speed : 1;
							const originalSourceIn = latestDragState.originalSourceIn || 0;

							const newStartTime = Math.max(0, latestDragState.startTime + deltaTime);
							const maxStartTime = latestDragState.startTime + latestDragState.startDuration - 0.1;
							clip.startTime = Math.min(newStartTime, maxStartTime);
							const trimAmount = clip.startTime - latestDragState.startTime;
							clip.duration = latestDragState.startDuration - trimAmount;

							const newSourceIn = originalSourceIn + trimAmount * speed;

							if (newSourceIn < 0) {
								const maxTrimBack = originalSourceIn / speed;
								clip.startTime = latestDragState.startTime - maxTrimBack;
								clip.duration = latestDragState.startDuration + maxTrimBack;
								clip.sourceIn = 0;
							} else {
								clip.sourceIn = newSourceIn;
							}

							newState.tracks[sourceTrackIndex].clips[clipIndex] = clip;
						} else if (latestDragState.type === "trim-end") {
							const speed = clip.type === "video" ? clip.properties.speed : clip.type === "audio" ? clip.properties.speed : 1;
							const newDuration = Math.max(0.1, latestDragState.startDuration + deltaTime);
							const maxTimelineDuration = prev.duration - clip.startTime;

							const maxSourceDuration = (clip.sourceDuration - clip.sourceIn) / speed;

							const maxDuration = Math.min(maxTimelineDuration, maxSourceDuration);
							clip.duration = Math.min(newDuration, maxDuration);
							newState.tracks[sourceTrackIndex].clips[clipIndex] = clip;
						}

						return newState;
					});
				});
			}
		};

		const handleMouseUp = () => {
			const currentDragState = dragStateRef.current;
			if (currentDragState && currentDragState.hasMoved) {
				updateTimelineState((prev) => {
					if (currentDragState.type === "move") {
						let actualTrackId = currentDragState.trackId;
						let clip: Clip | undefined;

						for (const track of prev.tracks) {
							const foundClip = track.clips.find((c) => c.id === currentDragState.clipId);
							if (foundClip) {
								clip = foundClip;
								actualTrackId = track.id;
								break;
							}
						}

						if (!clip) return prev;

						onClipUpdated?.(actualTrackId, clip);

						const result = placeClipOnTimeline(clip, actualTrackId, prev);

						for (const { trackId, clipId } of result.removedClips) {
							onClipRemoved?.(trackId, clipId);
						}
						for (const { trackId, clip: updatedClip } of result.updatedClips) {
							onClipUpdated?.(trackId, updatedClip);
						}
						for (const { trackId, clip: addedClip } of result.addedClips) {
							onClipAdded?.(trackId, addedClip);
						}

						return result.state;
					} else if (currentDragState.type === "trim-start" || currentDragState.type === "trim-end") {
						const track = prev.tracks.find((t) => t.id === currentDragState.trackId);
						const clip = track?.clips.find((c) => c.id === currentDragState.clipId);
						if (clip) {
							onClipUpdated?.(currentDragState.trackId, clip);

							const result = placeClipOnTimeline(clip, currentDragState.trackId, prev);

							for (const { trackId, clipId } of result.removedClips) {
								onClipRemoved?.(trackId, clipId);
							}
							for (const { trackId, clip: updatedClip } of result.updatedClips) {
								onClipUpdated?.(trackId, updatedClip);
							}
							for (const { trackId, clip: addedClip } of result.addedClips) {
								onClipAdded?.(trackId, addedClip);
							}

							return result.state;
						}
					}
					return prev;
				});
			}

			setDragState(null);
			lastHoveredTrackRef.current = null;
			dragUpdateScheduledRef.current = false;
			pendingDragUpdateRef.current = null;
			setHoveredTrackId(null);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [
		!!dragState,
		pixelsPerSecond,
		scrollContainerRef,
		trackRefsMap,
		setTimelineState,
		updateTimelineState,
		onClipUpdated,
		onClipRemoved,
		onClipAdded,
		snapOptions,
	]);

	return {
		dragState,
		setDragState,
		hoveredTrackId,
		setHoveredTrackId,
		handleClipDragStart,
	};
}
