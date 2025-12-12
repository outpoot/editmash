"use client";

import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { TimelineState, Clip, DragState, VideoClip, AudioClip } from "../types/timeline";
import TimelineTrack from "./TimelineTrack";
import TimeRuler from "./TimeRuler";
import { ZoomIn, ZoomOut, Play, Pause, MousePointer2, Scissors, Magnet } from "lucide-react";
import { getCurrentDragItem } from "./MediaBrowser";

// initial demo state
const initialTimelineState: TimelineState = {
	duration: 60,
	tracks: [
		{
			id: "video-1",
			type: "video",
			clips: [
				{
					id: "clip-3",
					type: "video",
					src: "/videos/overlay.mp4",
					startTime: 10,
					duration: 4,
					sourceIn: 0,
					properties: {
						position: { x: 100, y: 100 },
						size: { width: 640, height: 360 },
						zoom: { x: 1, y: 1, linked: true },
						rotation: 0,
						pitch: 0,
						yaw: 0,
						flip: { horizontal: false, vertical: false },
						crop: { left: 0, right: 0, top: 0, bottom: 0, softness: 0 },
						speed: 1,
						freezeFrame: false,
						freezeFrameTime: 0,
					},
				},
			],
		},
		{
			id: "video-0",
			type: "video",
			clips: [
				{
					id: "clip-1",
					type: "video",
					src: "/videos/intro.mp4",
					startTime: 0,
					duration: 5,
					sourceIn: 0,
					properties: {
						position: { x: 0, y: 0 },
						size: { width: 1920, height: 1080 },
						zoom: { x: 1, y: 1, linked: true },
						rotation: 0,
						pitch: 0,
						yaw: 0,
						flip: { horizontal: false, vertical: false },
						crop: { left: 0, right: 0, top: 0, bottom: 0, softness: 0 },
						speed: 1,
						freezeFrame: false,
						freezeFrameTime: 0,
					},
				},
				{
					id: "clip-2",
					type: "video",
					src: "/videos/scene1.mp4",
					startTime: 6,
					duration: 8,
					sourceIn: 0,
					properties: {
						position: { x: 0, y: 0 },
						size: { width: 1920, height: 1080 },
						zoom: { x: 1, y: 1, linked: true },
						rotation: 0,
						pitch: 0,
						yaw: 0,
						flip: { horizontal: false, vertical: false },
						crop: { left: 0, right: 0, top: 0, bottom: 0, softness: 0 },
						speed: 1,
						freezeFrame: false,
						freezeFrameTime: 0,
					},
				},
			],
		},
		{
			id: "audio-0",
			type: "audio",
			clips: [
				{
					id: "clip-4",
					type: "audio",
					src: "/audio/music.mp3",
					startTime: 0,
					duration: 15,
					sourceIn: 0,
					properties: {
						volume: 0.8,
						pan: 0,
						pitch: 0,
						speed: 1,
					},
				},
			],
		},
	],
};

interface TimelineProps {
	onClipSelect?: (selection: { clip: Clip; trackId: string }[] | null) => void;
	currentTime: number;
	currentTimeRef: React.MutableRefObject<number>;
	onTimeChange: (time: number) => void;
	isPlaying: boolean;
	onPlayingChange: (playing: boolean) => void;
	onTimelineStateChange: (state: TimelineState) => void;
}

export interface TimelineRef {
	updateClip: (trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<AudioClip>) => void;
}

const Timeline = forwardRef<TimelineRef, TimelineProps>(
	({ onClipSelect, currentTime, currentTimeRef, onTimeChange, isPlaying, onPlayingChange, onTimelineStateChange }, ref) => {
		const [timelineState, setTimelineState] = useState<TimelineState>(initialTimelineState);
		const [selectedClips, setSelectedClips] = useState<Array<{ clipId: string; trackId: string }>>([]);
		const [pixelsPerSecond, setPixelsPerSecond] = useState(50);
		const [dragState, setDragState] = useState<DragState | null>(null);
		const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
		const [toolMode, setToolMode] = useState<"select" | "blade">("select");
		const [bladeCursorPosition, setBladeCursorPosition] = useState<{ x: number; trackId: string } | null>(null);
		const [lastSelectedClip, setLastSelectedClip] = useState<{ clipId: string; trackId: string } | null>(null);
		const [dragPreview, setDragPreview] = useState<{
			trackId: string;
			startTime: number;
			duration: number;
			type: "video" | "audio";
		} | null>(null);
		const [isSnappingEnabled, setIsSnappingEnabled] = useState(true);

		const timelineRef = useRef<HTMLDivElement>(null);
		const scrollContainerRef = useRef<HTMLDivElement>(null);
		const trackRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
		const animationFrameRef = useRef<number | null>(null);
		const playbackStartTimeRef = useRef<number>(0);
		const playbackStartPositionRef = useRef<number>(0);
		const playheadElementRef = useRef<HTMLDivElement>(null);
		const lastStateUpdateRef = useRef<number>(0);
		const lastDragPreviewRef = useRef<{ trackId: string; startTime: number; duration: number } | null>(null);
		const lastBladeCursorRef = useRef<{ x: number; trackId: string } | null>(null);
		const lastHoveredTrackRef = useRef<string | null>(null);
		const dragUpdateScheduledRef = useRef<boolean>(false);
		const pendingDragUpdateRef = useRef<{ deltaTime: number; currentTrackId: string } | null>(null);

		useImperativeHandle(
			ref,
			() => ({
updateClip: (trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<AudioClip>) => {
					setTimelineState((prev) => {
						const newState = {
							...prev,
							tracks: prev.tracks.map((t) =>
								t.id === trackId
									? {
											...t,
											clips: t.clips.map((c) => {
												if (c.id === clipId) {
													// Type-safe merging based on clip type
													if (c.type === "video") {
														const videoUpdates = updates as Partial<VideoClip>;
														return {
															...c,
															...videoUpdates,
														} as VideoClip;
													} else {
														const audioUpdates = updates as Partial<AudioClip>;
														return {
															...c,
															...audioUpdates,
														} as AudioClip;
													}
												}
												return c;
											}),
									  }
									: t
							),
						};
						return newState;
					});
				},
			}),
			[]
		);

		useEffect(() => {
			if (dragState) return;
			onTimelineStateChange(timelineState);
		}, [timelineState, onTimelineStateChange, dragState]);

		useEffect(() => {
			if (selectedClips.length > 0 && onClipSelect) {
				const updatedSelections = selectedClips
					.map((s) => {
						const track = timelineState.tracks.find((t) => t.id === s.trackId);
						const clip = track?.clips.find((c) => c.id === s.clipId);
						return clip ? { clip, trackId: s.trackId } : null;
					})
					.filter((s): s is { clip: Clip; trackId: string } => s !== null);

				if (updatedSelections.length > 0) {
					onClipSelect(updatedSelections);
				}
			}
		}, [timelineState, selectedClips, onClipSelect]);

		useEffect(() => {
			if (!isPlaying && playheadElementRef.current) {
				const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
				playheadElementRef.current.style.transform = `translateX(${currentTime * pixelsPerSecond - scrollLeft}px)`;
			}
		}, [currentTime, pixelsPerSecond, isPlaying]);

		useEffect(() => {
			if (!isPlaying) {
				if (animationFrameRef.current) {
					cancelAnimationFrame(animationFrameRef.current);
					animationFrameRef.current = null;
				}
				return;
			}

			playbackStartTimeRef.current = performance.now();
			playbackStartPositionRef.current = currentTime;
			lastStateUpdateRef.current = performance.now();

			const animate = (timestamp: number) => {
				const elapsed = (timestamp - playbackStartTimeRef.current) / 1000;
				let newTime = playbackStartPositionRef.current + elapsed;

				if (newTime >= timelineState.duration) {
					newTime = timelineState.duration;
					onPlayingChange(false);
				}

				currentTimeRef.current = newTime;

				if (playheadElementRef.current) {
					const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
					const left = newTime * pixelsPerSecond - scrollLeft;
					playheadElementRef.current.style.transform = `translateX(${left}px)`;
				}

				// 60fps
				if (timestamp - lastStateUpdateRef.current > 16) {
					onTimeChange(newTime);
					lastStateUpdateRef.current = timestamp;
				}

				if (newTime < timelineState.duration) {
					animationFrameRef.current = requestAnimationFrame(animate);
				}
			};

			animationFrameRef.current = requestAnimationFrame(animate);

			return () => {
				if (animationFrameRef.current) {
					cancelAnimationFrame(animationFrameRef.current);
				}
			};
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [isPlaying]);

		// find which track the mouse is over
		const getTrackAtY = (clientY: number): string | null => {
			for (const [trackId, trackElement] of trackRefsMap.current.entries()) {
				const rect = trackElement.getBoundingClientRect();
				if (clientY >= rect.top && clientY <= rect.bottom) {
					return trackId;
				}
			}
			return null;
		};

		const snapPointsCache = useMemo(() => {
			const points: number[] = [0, timelineState.duration];

			timelineState.tracks.forEach((track) => {
				track.clips.forEach((clip) => {
					points.push(clip.startTime, clip.startTime + clip.duration);
				});
			});

			return points;
		}, [timelineState]);

		const calculateSnappedTime = useCallback(
			(targetTime: number, clipId: string, clipDuration: number): number => {
				if (!isSnappingEnabled) return targetTime;

				const snapThreshold = 0.15; // 150ms
				let closestSnapPoint: number | null = null;
				let minDistance = snapThreshold;

				const clipEnd = targetTime + clipDuration;

				const snapPoints = [...snapPointsCache, currentTimeRef.current];

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
			},
			[isSnappingEnabled, snapPointsCache, currentTimeRef]
		);

		const calculatePlayheadSnappedTime = useCallback(
			(targetTime: number): number => {
				if (!isSnappingEnabled) return targetTime;

				const snapThreshold = 0.15; // 150ms
				let closestSnapPoint: number | null = null;
				let minDistance = snapThreshold;

				const snapPoints = snapPointsCache;

				for (let i = 0; i < snapPoints.length; i++) {
					const snapPoint = snapPoints[i];
					const distance = Math.abs(targetTime - snapPoint);
					if (distance < minDistance) {
						minDistance = distance;
						closestSnapPoint = snapPoint;
					}
				}

				return closestSnapPoint !== null ? closestSnapPoint : targetTime;
			},
			[isSnappingEnabled, snapPointsCache]
		);

		// clip placement on drop
		const handleClipPlacement = useCallback((clip: Clip, trackId: string, state: TimelineState): TimelineState => {
			const newState = {
				...state,
				tracks: state.tracks.map((t) => ({
					...t,
					clips: [...t.clips],
				})),
			};
			const track = newState.tracks.find((t) => t.id === trackId);
			if (!track) return state;

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
				return newState;
			}

			for (const overlappingClip of overlaps) {
				const overlapStart = overlappingClip.startTime;
				const overlapEnd = overlappingClip.startTime + overlappingClip.duration;

				// case 1: new clip completely covers the overlapping clip - remove it
				if (clip.startTime <= overlapStart && clipEnd >= overlapEnd) {
					const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
					newState.tracks[trackIndex].clips = newState.tracks[trackIndex].clips.filter((c) => c.id !== overlappingClip.id);
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
					const speed = overlappingClip.type === "video" ? overlappingClip.properties.speed : 1;
					const sourceOffset = timelineOffset * speed;

					// create right part
					const rightPart: Clip = {
						...overlappingClip,
						id: `${overlappingClip.id}-split-${Date.now()}`,
						startTime: clipEnd,
						duration: overlapEnd - clipEnd,
						sourceIn: overlappingClip.sourceIn + sourceOffset,
					};

					// Replace original with left part and add right part
					newState.tracks[trackIndex].clips[clipIndex] = leftPart;
					newState.tracks[trackIndex].clips.push(rightPart);
				}
				// case 3: new clip overlaps the start - trim overlapping clip from start
				else if (clip.startTime <= overlapStart && clipEnd > overlapStart && clipEnd < overlapEnd) {
					const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
					const clipIndex = newState.tracks[trackIndex].clips.findIndex((c) => c.id === overlappingClip.id);

					const trimmed = { ...overlappingClip };
					const trimAmount = clipEnd - overlapStart;
					const speed = overlappingClip.type === "video" ? overlappingClip.properties.speed : 1;
					const sourceOffset = trimAmount * speed;
					trimmed.startTime = clipEnd;
					trimmed.duration = overlappingClip.duration - trimAmount;
					trimmed.sourceIn = overlappingClip.sourceIn + sourceOffset;

					newState.tracks[trackIndex].clips[clipIndex] = trimmed;
				}
				// case 4: new clip overlaps the end - trim overlapping clip from end
				else if (clip.startTime > overlapStart && clip.startTime < overlapEnd && clipEnd >= overlapEnd) {
					const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
					const clipIndex = newState.tracks[trackIndex].clips.findIndex((c) => c.id === overlappingClip.id);

					const trimmed = { ...overlappingClip };
					trimmed.duration = clip.startTime - overlapStart;

					newState.tracks[trackIndex].clips[clipIndex] = trimmed;
				}
			}

			return newState;
		}, []);

		// handle mouse move and up for dragging
		const dragStateRef = useRef<DragState | null>(null);
		dragStateRef.current = dragState;

		useEffect(() => {
			if (!dragState) return;

			const handleMouseMove = (e: MouseEvent) => {
				const currentDragState = dragStateRef.current;
				if (!timelineRef.current || !currentDragState) return;

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
					const hoveredTrack = getTrackAtY(e.clientY);
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

							let clip = {
								...newState.tracks[sourceTrackIndex].clips[clipIndex],
							};

							if (latestDragState.type === "move") {
								let newStartTime = Math.max(0, latestDragState.startTime + deltaTime);
								newStartTime = Math.min(newStartTime, prev.duration - clip.duration);
								newStartTime = calculateSnappedTime(newStartTime, clip.id, clip.duration);
								clip.startTime = newStartTime;

								// handle cross-track movement
								if (currentTrackId !== latestDragState.trackId) {
									const targetTrackIndex = newState.tracks.findIndex((t) => t.id === currentTrackId);
									const targetTrack = newState.tracks[targetTrackIndex];

									if (targetTrack && targetTrack.type === clip.type) {
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
								const newStartTime = Math.max(0, latestDragState.startTime + deltaTime);
								const maxStartTime = latestDragState.startTime + latestDragState.startDuration - 0.1;
								clip.startTime = Math.min(newStartTime, maxStartTime);
								const trimAmount = clip.startTime - latestDragState.startTime;
								clip.duration = latestDragState.startDuration - trimAmount;

								if (clip.type === "video") {
									const originalSourceIn = latestDragState.originalSourceIn || 0;
									clip.sourceIn = originalSourceIn + trimAmount * clip.properties.speed;
								}
								newState.tracks[sourceTrackIndex].clips[clipIndex] = clip;
							} else if (latestDragState.type === "trim-end") {
								const newDuration = Math.max(0.1, latestDragState.startDuration + deltaTime);
								const maxDuration = prev.duration - clip.startTime;
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
				if (currentDragState && currentDragState.type === "move" && currentDragState.hasMoved) {
					setTimelineState((prev) => {
						const track = prev.tracks.find((t) => t.id === currentDragState.trackId);
						const clip = track?.clips.find((c) => c.id === currentDragState.clipId);

						if (!clip) return prev;

						return handleClipPlacement(clip, currentDragState.trackId, prev);
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
		}, [!!dragState, pixelsPerSecond, calculateSnappedTime, handleClipPlacement]);

		const timelineStateRef = useRef(timelineState);
		timelineStateRef.current = timelineState;
		const selectedClipsRef = useRef(selectedClips);
		selectedClipsRef.current = selectedClips;
		const lastSelectedClipRef = useRef(lastSelectedClip);
		lastSelectedClipRef.current = lastSelectedClip;
		const onClipSelectRef = useRef(onClipSelect);
		onClipSelectRef.current = onClipSelect;

		const handleClipSelect = useCallback((clipId: string, trackId: string, event?: { ctrlKey: boolean; shiftKey: boolean }) => {
			const ctrlKey = event?.ctrlKey || false;
			const shiftKey = event?.shiftKey || false;
			const currentTimelineState = timelineStateRef.current;
			const currentSelectedClips = selectedClipsRef.current;
			const currentLastSelectedClip = lastSelectedClipRef.current;
			const currentOnClipSelect = onClipSelectRef.current;

			if (shiftKey && currentLastSelectedClip) {
				const allClips: Array<{ clipId: string; trackId: string }> = [];
				currentTimelineState.tracks.forEach((track) => {
					track.clips.forEach((clip) => {
						allClips.push({ clipId: clip.id, trackId: track.id });
					});
				});

				const lastIndex = allClips.findIndex(
					(c) => c.clipId === currentLastSelectedClip.clipId && c.trackId === currentLastSelectedClip.trackId
				);
				const currentIndex = allClips.findIndex((c) => c.clipId === clipId && c.trackId === trackId);

				if (lastIndex !== -1 && currentIndex !== -1) {
					const start = Math.min(lastIndex, currentIndex);
					const end = Math.max(lastIndex, currentIndex);
					const rangeClips = allClips.slice(start, end + 1);
					setSelectedClips(rangeClips);

					const selections = rangeClips
						.map((c) => {
							const track = currentTimelineState.tracks.find((t) => t.id === c.trackId);
							const clip = track?.clips.find((cl) => cl.id === c.clipId);
							return clip ? { clip, trackId: c.trackId } : null;
						})
						.filter((s): s is { clip: Clip; trackId: string } => s !== null);

					currentOnClipSelect?.(selections);
				}
			} else if (ctrlKey) {
				const isAlreadySelected = currentSelectedClips.some((c) => c.clipId === clipId && c.trackId === trackId);

				let newSelection: Array<{ clipId: string; trackId: string }>;
				if (isAlreadySelected) {
					newSelection = currentSelectedClips.filter((c) => !(c.clipId === clipId && c.trackId === trackId));
				} else {
					newSelection = [...currentSelectedClips, { clipId, trackId }];
				}

				setSelectedClips(newSelection);
				setLastSelectedClip({ clipId, trackId });

				if (newSelection.length === 0) {
					currentOnClipSelect?.(null);
				} else {
					const selections = newSelection
						.map((c) => {
							const track = currentTimelineState.tracks.find((t) => t.id === c.trackId);
							const clip = track?.clips.find((cl) => cl.id === c.clipId);
							return clip ? { clip, trackId: c.trackId } : null;
						})
						.filter((s): s is { clip: Clip; trackId: string } => s !== null);

					currentOnClipSelect?.(selections);
				}
			} else {
				setSelectedClips([{ clipId, trackId }]);
				setLastSelectedClip({ clipId, trackId });

				const track = currentTimelineState.tracks.find((t) => t.id === trackId);
				const clip = track?.clips.find((c) => c.id === clipId);

				if (clip) {
					currentOnClipSelect?.([{ clip, trackId }]);
				}
			}
		}, []);

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
			[]
		);

		const handleDeleteClip = useCallback(() => {
			if (selectedClips.length === 0) return;

			setTimelineState((prev) => {
				const newState = {
					...prev,
					tracks: prev.tracks.map((t) => ({
						...t,
						clips: [...t.clips],
					})),
				};

				selectedClips.forEach(({ clipId, trackId }) => {
					const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
					if (trackIndex !== -1) {
						newState.tracks[trackIndex].clips = newState.tracks[trackIndex].clips.filter((c) => c.id !== clipId);
					}
				});

				return newState;
			});

			setSelectedClips([]);
			setLastSelectedClip(null);
			onClipSelect?.(null);
		}, [selectedClips, onClipSelect]);

		const handleZoomIn = useCallback(() => {
			setPixelsPerSecond((prev) => Math.min(prev + 10, 200));
		}, []);

		const handleZoomOut = useCallback(() => {
			setPixelsPerSecond((prev) => Math.max(prev - 10, 10));
		}, []);

		const calculatePlayheadSnappedTimeRef = useRef(calculatePlayheadSnappedTime);
		calculatePlayheadSnappedTimeRef.current = calculatePlayheadSnappedTime;
		const isPlayingRef = useRef(isPlaying);
		isPlayingRef.current = isPlaying;
		const onTimeChangeRef = useRef(onTimeChange);
		onTimeChangeRef.current = onTimeChange;

		const handleSeek = useCallback(
			(time: number) => {
				const snappedTime = calculatePlayheadSnappedTimeRef.current(time);
				currentTimeRef.current = snappedTime;
				onTimeChangeRef.current(snappedTime);

				if (isPlayingRef.current) {
					playbackStartTimeRef.current = performance.now();
					playbackStartPositionRef.current = snappedTime;
				}
			},
			[currentTimeRef]
		);

		const handlePlayPause = useCallback(() => {
			onPlayingChange(!isPlaying);
		}, [isPlaying, onPlayingChange]);

		const handleTimelineClick = () => {
			setSelectedClips([]);
			setLastSelectedClip(null);
			onClipSelect?.(null);
		};

		const handleTrackMouseMove = useCallback(
			(e: React.MouseEvent, trackId: string) => {
				if (toolMode !== "blade") {
					if (lastBladeCursorRef.current !== null) {
						lastBladeCursorRef.current = null;
						setBladeCursorPosition(null);
					}
					return;
				}

				const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
				const rect = timelineRef.current?.getBoundingClientRect();
				if (!rect) return;

				const mouseX = e.clientX - rect.left + scrollLeft;
				const mouseTime = mouseX / pixelsPerSecond;

				const fps = 30;
				const frameTime = 1 / fps;
				const snappedTime = Math.round(mouseTime / frameTime) * frameTime;
				const snappedX = snappedTime * pixelsPerSecond;

				const last = lastBladeCursorRef.current;
				const threshold = 1; // 1px
				if (!last || last.trackId !== trackId || Math.abs(last.x - snappedX) > threshold) {
					const newPosition = { x: snappedX, trackId };
					lastBladeCursorRef.current = newPosition;
					setBladeCursorPosition(newPosition);
				}
			},
			[toolMode, pixelsPerSecond]
		);

		const handleMediaDragOver = useCallback(
			(e: React.DragEvent, trackId: string) => {
				e.preventDefault();
				e.dataTransfer.dropEffect = "copy";

				const mediaItem = getCurrentDragItem();
				if (!mediaItem) return;

				const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
				const rect = timelineRef.current?.getBoundingClientRect();
				if (!rect) return;

				const dragX = e.clientX - rect.left + scrollLeft;
				const dragTime = Math.max(0, dragX / pixelsPerSecond);

				let clipDuration = mediaItem.duration;
				if (dragTime + clipDuration > timelineState.duration) {
					clipDuration = timelineState.duration - dragTime;
				}

				if (clipDuration <= 0) {
					if (lastDragPreviewRef.current !== null) {
						lastDragPreviewRef.current = null;
						setDragPreview(null);
					}
					return;
				}

				const last = lastDragPreviewRef.current;
				const threshold = 0.01; // 10ms threshold
				if (
					!last ||
					last.trackId !== trackId ||
					Math.abs(last.startTime - dragTime) > threshold ||
					Math.abs(last.duration - clipDuration) > threshold
				) {
					const newPreview = {
						trackId,
						startTime: dragTime,
						duration: clipDuration,
						type: mediaItem.type,
					};
					lastDragPreviewRef.current = newPreview;
					setDragPreview(newPreview);
				}
			},
			[pixelsPerSecond, timelineState.duration]
		);

		const handleMediaDrop = useCallback(
			(e: React.DragEvent, trackId: string) => {
				setDragPreview(null);

				try {
					const mediaItemData = e.dataTransfer.getData("application/media-item");
					if (!mediaItemData) return;

					const mediaItem = JSON.parse(mediaItemData);

					const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
					const rect = timelineRef.current?.getBoundingClientRect();
					if (!rect) return;

					const dropX = e.clientX - rect.left + scrollLeft;
					const dropTime = Math.max(0, dropX / pixelsPerSecond);

					let clipDuration = mediaItem.duration;
					if (dropTime + clipDuration > timelineState.duration) {
						clipDuration = timelineState.duration - dropTime;
					}

					if (clipDuration <= 0) return;

					let clipWidth = 1920;
					let clipHeight = 1080;
					let clipX = 0;
					let clipY = 0;

					if (mediaItem.type === "video" && mediaItem.width && mediaItem.height) {
						const videoAspect = mediaItem.width / mediaItem.height;
						const canvasAspect = 1920 / 1080;

						if (videoAspect > canvasAspect) {
							clipWidth = 1920;
							clipHeight = 1920 / videoAspect;
							clipX = 0;
							clipY = (1080 - clipHeight) / 2;
						} else {
							clipHeight = 1080;
							clipWidth = 1080 * videoAspect;
							clipX = (1920 - clipWidth) / 2;
							clipY = 0;
						}
					}

					const newClip: Clip =
						mediaItem.type === "video"
							? {
									id: `clip-${Date.now()}-${Math.random()}`,
									type: "video",
									src: mediaItem.url,
									startTime: dropTime,
									duration: clipDuration,
									sourceIn: 0,
									properties: {
										position: { x: clipX, y: clipY },
										size: { width: clipWidth, height: clipHeight },
										zoom: { x: 1, y: 1, linked: true },
										rotation: 0,
										pitch: 0,
										yaw: 0,
										flip: { horizontal: false, vertical: false },
										crop: { left: 0, right: 0, top: 0, bottom: 0, softness: 0 },
										speed: 1,
										freezeFrame: false,
										freezeFrameTime: 0,
									},
							  }
							: {
									id: `clip-${Date.now()}-${Math.random()}`,
									type: "audio",
									src: mediaItem.url,
									startTime: dropTime,
									duration: clipDuration,
									sourceIn: 0,
									properties: {
										volume: 1.0,
										pan: 0,
										pitch: 0,
										speed: 1,
									},
							  };

					setTimelineState((prev) => {
						const newState = {
							...prev,
							tracks: prev.tracks.map((t) => ({
								...t,
								clips: [...t.clips],
							})),
						};

						const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
						if (trackIndex === -1) return prev;

						const track = newState.tracks[trackIndex];

						if (track.type !== mediaItem.type) return prev;

						newState.tracks[trackIndex].clips.push(newClip);

						return handleClipPlacement(newClip, trackId, newState);
					});
				} catch (err) {
					console.error("Error handling media drop:", err);
				}
			},
			[pixelsPerSecond, timelineState.duration, handleClipPlacement]
		);

		const handleMediaDragLeave = useCallback(() => {
			lastDragPreviewRef.current = null;
			setDragPreview(null);
		}, []);

		const handleBladeClick = useCallback(
			(e: React.MouseEvent, trackId: string) => {
				if (toolMode !== "blade") return;

				e.stopPropagation();

				const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
				const rect = timelineRef.current?.getBoundingClientRect();
				if (!rect) return;

				const clickX = e.clientX - rect.left + scrollLeft;
				const mouseTime = clickX / pixelsPerSecond;

				const fps = 30;
				const frameTime = 1 / fps;
				const clickTime = Math.round(mouseTime / frameTime) * frameTime;

				setTimelineState((prev) => {
					const newState = {
						...prev,
						tracks: prev.tracks.map((t) => ({
							...t,
							clips: [...t.clips],
						})),
					};

					const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
					if (trackIndex === -1) return prev;

					const track = newState.tracks[trackIndex];

					// find clip at click position
					const clipIndex = track.clips.findIndex((c) => {
						const clipEnd = c.startTime + c.duration;
						return clickTime >= c.startTime && clickTime < clipEnd;
					});

					if (clipIndex === -1) return prev;

					const clipToSplit = track.clips[clipIndex];

					// don't split at exact start or end of clip
					const fps = 30;
					const frameTime = 1 / fps;
					if (clickTime <= clipToSplit.startTime || clickTime >= clipToSplit.startTime + clipToSplit.duration - frameTime) {
						return prev;
					}

					const leftPart = {
						...clipToSplit,
						duration: clickTime - clipToSplit.startTime,
					};

					// calculate source time offset for right part
					const timelineOffset = clickTime - clipToSplit.startTime;
					const speed = clipToSplit.type === "video" ? clipToSplit.properties.speed : 1;
					const sourceOffset = timelineOffset * speed;

					// create right part
					const rightPart: Clip = {
						...clipToSplit,
						id: `${clipToSplit.id}-split-${Date.now()}`,
						startTime: clickTime,
						duration: clipToSplit.startTime + clipToSplit.duration - clickTime,
						sourceIn: clipToSplit.sourceIn + sourceOffset,
					};

					// replace original with left part and add right part
					newState.tracks[trackIndex].clips[clipIndex] = leftPart;
					newState.tracks[trackIndex].clips.push(rightPart);

					return newState;
				});
			},
			[toolMode, pixelsPerSecond]
		);

		useEffect(() => {
			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
					return;
				}

				if (e.key === " ") {
					e.preventDefault();
					handlePlayPause();
				} else if (e.key === "a" || e.key === "A") {
					e.preventDefault();
					setToolMode("select");
				} else if (e.key === "b" || e.key === "B") {
					e.preventDefault();
					setToolMode("blade");
				} else if (e.key === "n" || e.key === "N") {
					e.preventDefault();
					setIsSnappingEnabled((prev) => !prev);
				} else if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
					e.preventDefault();
					handleZoomIn();
				} else if (e.ctrlKey && e.key === "-") {
					e.preventDefault();
					handleZoomOut();
				} else if (e.key === "Backspace" || e.key === "Delete") {
					if (selectedClips.length > 0) {
						handleDeleteClip();
					}
				} else if (e.key === "Escape") {
					setSelectedClips([]);
					setLastSelectedClip(null);
					onClipSelect?.(null);
				}
			};

			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [selectedClips, onClipSelect, handleDeleteClip, handleZoomIn, handleZoomOut, handlePlayPause]);

		// handle timeline scroll thru shortcuts
		useEffect(() => {
			const scrollContainer = scrollContainerRef.current;
			if (!scrollContainer) return;

			const handleWheel = (e: WheelEvent) => {
				if (e.ctrlKey) {
					e.preventDefault();

					// scroll horizontally
					scrollContainer.scrollLeft += e.deltaY;
				}
				// default vertical scrolling
			};

			scrollContainer.addEventListener("wheel", handleWheel, { passive: false });
			return () => scrollContainer.removeEventListener("wheel", handleWheel);
		}, []);

		useEffect(() => {
			const scrollContainer = scrollContainerRef.current;
			if (!scrollContainer) return;

			const handleScroll = () => {
				const newScrollLeft = scrollContainer.scrollLeft;
				if (playheadElementRef.current) {
					playheadElementRef.current.style.transform = `translateX(${currentTimeRef.current * pixelsPerSecond - newScrollLeft}px)`;
					const shouldBeAbove = currentTimeRef.current === 0 && newScrollLeft < 6;
					playheadElementRef.current.style.zIndex = shouldBeAbove ? "80" : "60";
				}
			};

			scrollContainer.addEventListener("scroll", handleScroll);
			return () => scrollContainer.removeEventListener("scroll", handleScroll);
		}, [pixelsPerSecond]);

		const timelineWidth = timelineState.duration * pixelsPerSecond;

		return (
			<div className="h-full bg-[#1a1a1a] border-t border-zinc-800 flex flex-col">
				<div className="h-10 bg-[#1e1e1e] border-b border-zinc-800 flex items-center justify-between px-4">
					<div className="flex items-center gap-3">
						<button
							onClick={handlePlayPause}
							className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200"
							title={isPlaying ? "Pause" : "Play"}
						>
							{isPlaying ? <Pause size={16} /> : <Play size={16} />}
						</button>
						<div className="w-px h-6 bg-zinc-700" />
						<div className="flex items-center gap-1">
							<button
								onClick={() => setToolMode("select")}
								className={`p-1.5 rounded ${
									toolMode === "select" ? "bg-blue-600 text-white" : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
								}`}
								title="Select Mode (A)"
							>
								<MousePointer2 size={16} />
							</button>
							<button
								onClick={() => setToolMode("blade")}
								className={`p-1.5 rounded ${
									toolMode === "blade" ? "bg-blue-600 text-white" : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
								}`}
								title="Blade Mode (B)"
							>
								<Scissors size={16} />
							</button>
						</div>
						<div className="w-px h-6 bg-zinc-700" />
						<button
							onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}
							className={`p-1.5 rounded ${
								isSnappingEnabled ? "bg-blue-600 text-white" : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
							}`}
							title={isSnappingEnabled ? "Snapping Enabled (N)" : "Snapping Disabled (N)"}
						>
							<Magnet size={16} />
						</button>
					</div>
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-1">
							<button onClick={handleZoomOut} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="Zoom out">
								<ZoomOut size={16} />
							</button>
							<span className="text-xs text-zinc-500 w-12 text-center">{Math.round((pixelsPerSecond / 50) * 100)}%</span>
							<button onClick={handleZoomIn} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="Zoom in">
								<ZoomIn size={16} />
							</button>
						</div>
					</div>
				</div>

				<div className="flex-1 flex overflow-hidden relative">
					<div className="w-32 flex-shrink-0 bg-[#1e1e1e] border-r border-zinc-800 flex flex-col relative z-[70]">
						<div className="absolute left-0 top-0 bottom-0 bg-[#1e1e1e] pointer-events-none" style={{ width: "calc(100% - 4px)" }} />
						<div className="h-8 border-b border-zinc-800 flex items-center justify-center relative">
							<span className="text-sm text-zinc-300 font-mono tabular-nums">
								{Math.floor(currentTime / 60)
									.toString()
									.padStart(2, "0")}
								:
								{Math.floor(currentTime % 60)
									.toString()
									.padStart(2, "0")}
								:
								{Math.floor((currentTime % 1) * 30)
									.toString()
									.padStart(2, "0")}
							</span>
						</div>
						{timelineState.tracks.map((track) => (
							<div key={track.id} className="h-[2.5rem] border-b border-zinc-800 flex items-center px-3 relative">
								<div className="flex items-center gap-2">
									<div className={`w-2 h-2 rounded-full ${track.type === "video" ? "bg-purple-500" : "bg-green-500"}`} />
									<span className="text-sm text-zinc-300 font-medium">
										{track.type === "video" ? "Video" : "Audio"} {track.id.split("-")[1]}
									</span>
								</div>
							</div>
						))}
					</div>

					<div
						ref={scrollContainerRef}
						className="flex-1 overflow-auto relative"
						style={{
							cursor:
								toolMode === "blade"
									? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M9 3H5a2 2 0 0 0-2 2v4m6-6v6.5m0 0l-3.5 3.5M9 9.5l3.5 3.5M19 3h4m0 0v4m0-4l-7 7m7 10v-4m0 4h-4m4 0l-7-7'/%3E%3C/svg%3E\") 12 12, crosshair"
									: "default",
						}}
						onClick={handleTimelineClick}
					>
						<div className="min-w-full inline-block" style={{ width: `${timelineWidth + 200}px` }}>
							<div ref={timelineRef}>
								<TimeRuler duration={timelineState.duration} pixelsPerSecond={pixelsPerSecond} onSeek={handleSeek} />
							</div>

							<div className="relative">
								{timelineState.tracks.map((track) => (
									<div
										key={track.id}
										ref={(el) => {
											if (el) {
												trackRefsMap.current.set(track.id, el);
											} else {
												trackRefsMap.current.delete(track.id);
											}
										}}
									>
										<TimelineTrack
											track={track}
											pixelsPerSecond={pixelsPerSecond}
											selectedClips={selectedClips}
											draggedClipId={dragState?.clipId || null}
											isHovered={hoveredTrackId === track.id}
											onClipSelect={handleClipSelect}
											onClipDragStart={handleClipDragStart}
											onTrackClick={handleTimelineClick}
											onTrackMouseEnter={() => setHoveredTrackId(track.id)}
											toolMode={toolMode}
											onBladeClick={handleBladeClick}
											onTrackMouseMove={handleTrackMouseMove}
											bladeCursorPosition={bladeCursorPosition?.trackId === track.id ? bladeCursorPosition.x : null}
											onMediaDrop={handleMediaDrop}
											onMediaDragOver={handleMediaDragOver}
											onMediaDragLeave={handleMediaDragLeave}
											timelineRef={timelineRef}
											scrollContainerRef={scrollContainerRef}
											timelineDuration={timelineState.duration}
											dragPreview={dragPreview}
										/>
									</div>
								))}
							</div>
						</div>
					</div>

					<div
						ref={playheadElementRef}
						className="absolute pointer-events-none"
						style={{
							left: "8rem",
							top: 0,
							height: "100%",
							willChange: isPlaying ? "transform" : "auto",
							zIndex: currentTime === 0 ? 80 : 60,
						}}
					>
						<div className="absolute w-0.5 bg-red-500 h-full" />

						<svg
							width="12"
							height="10"
							viewBox="0 0 12 10"
							className="absolute top-0 cursor-ew-resize pointer-events-auto"
							style={{
								left: "1px",
								transform: "translateX(-50%)",
								display: "block",
							}}
							onMouseDown={(e) => {
								e.stopPropagation();
								const startX = e.clientX;
								const startTime = currentTime;
								const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;

								const handleMouseMove = (moveEvent: MouseEvent) => {
									const currentScrollLeft = scrollContainerRef.current?.scrollLeft || 0;
									const deltaX = moveEvent.clientX - startX + (currentScrollLeft - scrollLeft);
									const deltaTime = deltaX / pixelsPerSecond;
									let newTime = Math.max(0, Math.min(startTime + deltaTime, timelineState.duration));

									newTime = calculatePlayheadSnappedTime(newTime);

									currentTimeRef.current = newTime;
									onTimeChange(newTime);

									if (playheadElementRef.current) {
										const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
										playheadElementRef.current.style.transform = `translateX(${newTime * pixelsPerSecond - scrollLeft}px)`;
									}
								};

								const handleMouseUp = () => {
									window.removeEventListener("mousemove", handleMouseMove);
									window.removeEventListener("mouseup", handleMouseUp);

									if (isPlaying) {
										playbackStartTimeRef.current = performance.now();
										playbackStartPositionRef.current = currentTimeRef.current;
									}
								};

								window.addEventListener("mousemove", handleMouseMove);
								window.addEventListener("mouseup", handleMouseUp);
							}}
						>
							<path d="M6 10 L12 0 L0 0 Z" fill="#ef4444" />
						</svg>
					</div>
				</div>
			</div>
		);
	}
);

Timeline.displayName = "Timeline";

export default Timeline;
