"use client";

import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { TimelineState, Clip, DragState, VideoClip, ImageClip, AudioClip } from "../types/timeline";
import TimelineTrack from "./TimelineTrack";
import TimeRuler from "./TimeRuler";
import type { RemoteSelection } from "./MatchWS";
import type { ClipChangeNotification } from "./TimelineClip";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	SearchAddIcon,
	SearchMinusIcon,
	PlayIcon,
	PauseIcon,
	Cursor01Icon,
	ScissorIcon,
	MagnetIcon,
	Undo02Icon,
	Redo02Icon,
	SquareIcon,
	CropIcon,
	ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { getCurrentDragItem } from "./MediaCardDock";
import { historyStore } from "../store/historyStore";
import { generateThumbnail } from "../store/mediaStore";

function clipsEqual(a: Clip, b: Clip): boolean {
	const { thumbnail: _a, ...aRest } = a as Clip & { thumbnail?: string };
	const { thumbnail: _b, ...bRest } = b as Clip & { thumbnail?: string };
	return JSON.stringify(aRest) === JSON.stringify(bRest);
}

function generateAndUpdateThumbnail(clip: Clip, setTimelineState: React.Dispatch<React.SetStateAction<TimelineState>>) {
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

const initialTimelineState: TimelineState = {
	duration: 60,
	tracks: [
		{ id: "video-0", type: "video", clips: [] },
		{ id: "video-1", type: "video", clips: [] },
		{ id: "audio-0", type: "audio", clips: [] },
	],
};

interface PlacementResult {
	state: TimelineState;
	removedClips: Array<{ trackId: string; clipId: string }>;
	updatedClips: Array<{ trackId: string; clip: Clip }>;
	addedClips: Array<{ trackId: string; clip: Clip }>;
}

function placeClipOnTimeline(clip: Clip, trackId: string, state: TimelineState): PlacementResult {
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
			updatedClips.push({ trackId, clip: leftPart });
			addedClips.push({ trackId, clip: rightPart });
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

interface TimelineProps {
	onClipSelect?: (selection: { clip: Clip; trackId: string }[] | null) => void;
	currentTime: number;
	currentTimeRef: React.MutableRefObject<number>;
	onTimeChange: (time: number) => void;
	isPlaying: boolean;
	onPlayingChange: (playing: boolean) => void;
	onTimelineStateChange: (state: TimelineState) => void;
	onTransformModeChange?: (mode: "transform" | "crop" | null) => void;
	onClipAdded?: (trackId: string, clip: Clip) => void;
	onClipUpdated?: (trackId: string, clip: Clip) => void;
	onClipRemoved?: (trackId: string, clipId: string) => void;
	onClipSplit?: (trackId: string, originalClip: Clip, newClip: Clip) => void;
	remoteSelections?: Map<string, RemoteSelection>;
}

export interface TimelineRef {
	updateClip: (trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<ImageClip> | Partial<AudioClip>) => void;
	updateRemoteClip: (trackId: string, clipId: string, updates: Partial<Clip>) => void;
	moveRemoteClip: (oldTrackId: string, newTrackId: string, clipId: string, updates: Partial<Clip>) => void;
	loadTimeline: (state: TimelineState) => void;
	addRemoteClip: (trackId: string, clip: Clip) => void;
	removeRemoteClip: (trackId: string, clipId: string) => void;
	splitRemoteClip: (trackId: string, originalClip: Clip, newClip: Clip) => void;
	syncZoneClips: (clips: Array<{ trackId: string; clip: Clip }>) => void;
	getState: () => TimelineState;
}

const Timeline = forwardRef<TimelineRef, TimelineProps>(
	(
		{
			onClipSelect,
			currentTime,
			currentTimeRef,
			onTimeChange,
			isPlaying,
			onPlayingChange,
			onTimelineStateChange,
			onTransformModeChange,
			onClipAdded,
			onClipUpdated,
			onClipRemoved,
			onClipSplit,
			remoteSelections,
		},
		ref
	) => {
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
		const [clipboard, setClipboard] = useState<Array<{ clip: Clip; trackId: string }> | null>(null);
		const [canUndo, setCanUndo] = useState(false);
		const [canRedo, setCanRedo] = useState(false);
		const [transformMode, setTransformMode] = useState<"transform" | "crop" | null>(null);
		const [showTransformMenu, setShowTransformMenu] = useState(false);
		const [clipChangeNotifications, setClipChangeNotifications] = useState<Map<string, ClipChangeNotification[]>>(new Map());

		const timelineRef = useRef<HTMLDivElement>(null);
		const scrollContainerRef = useRef<HTMLDivElement>(null);
		const trackNamesRef = useRef<HTMLDivElement>(null);
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

		const updateTimelineState = useCallback((updater: (prev: TimelineState) => TimelineState) => {
			setTimelineState((prev) => {
				const newState = updater(prev);
				historyStore.push(newState);
				return newState;
			});
		}, []);

		useImperativeHandle(
			ref,
			() => ({
				updateClip: (trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<ImageClip> | Partial<AudioClip>) => {
					updateTimelineState((prev) => {
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
													} else if (c.type === "image") {
														const imageUpdates = updates as Partial<ImageClip>;
														return {
															...c,
															...imageUpdates,
														} as ImageClip;
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
				loadTimeline: (state: TimelineState) => {
					setTimelineState(state);
					setSelectedClips([]);
					setLastSelectedClip(null);
					historyStore.clear();
					historyStore.push(state);

					state.tracks.forEach((track) => {
						track.clips.forEach((clip) => {
							generateAndUpdateThumbnail(clip, setTimelineState);
						});
					});
				},
				addRemoteClip: (trackId: string, clip: Clip) => {
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

						const existingClip = newState.tracks[trackIndex].clips.find((c) => c.id === clip.id);
						if (existingClip) return prev;

						newState.tracks[trackIndex].clips.push(clip);
						return placeClipOnTimeline(clip, trackId, newState).state;
					});

					generateAndUpdateThumbnail(clip, setTimelineState);
				},
				removeRemoteClip: (trackId: string, clipId: string) => {
					setTimelineState((prev) => {
						let foundTrackId: string | null = null;
						for (const track of prev.tracks) {
							if (track.clips.some((c) => c.id === clipId)) {
								foundTrackId = track.id;
								break;
							}
						}

						if (!foundTrackId) return prev;

						return {
							...prev,
							tracks: prev.tracks.map((t) =>
								t.id === foundTrackId
									? {
											...t,
											clips: t.clips.filter((c) => c.id !== clipId),
									  }
									: t
							),
						};
					});
				},
				updateRemoteClip: (trackId: string, clipId: string, updates: Partial<Clip>) => {
					const notifications: string[] = [];

					let existingClip: Clip | undefined;
					for (const track of timelineState.tracks) {
						const found = track.clips.find((c) => c.id === clipId);
						if (found) {
							existingClip = found;
							break;
						}
					}

					if (existingClip && updates.properties) {
						const props = updates.properties as unknown as Record<string, unknown>;
						const existingProps = existingClip.properties as unknown as Record<string, unknown>;

						// Audio properties
						if (props.volume !== undefined && props.volume !== existingProps.volume) {
							notifications.push(`volume ${Math.round((props.volume as number) * 100)}%`);
						}
						if (props.pan !== undefined && props.pan !== existingProps.pan) {
							const pan = props.pan as number;
							notifications.push(`pan ${pan < 0 ? "L" : pan > 0 ? "R" : "C"}${Math.abs(Math.round(pan * 100))}%`);
						}
						if (props.pitch !== undefined && props.pitch !== existingProps.pitch) {
							const pitch = props.pitch as number;
							notifications.push(`pitch ${pitch > 0 ? "+" : ""}${pitch}`);
						}
						if (props.speed !== undefined && props.speed !== existingProps.speed) {
							notifications.push(`speed ${Math.round((props.speed as number) * 100)}%`);
						}

						// Video/Image properties
						const existingPosition = existingProps.position as { x: number; y: number } | undefined;
						const newPosition = props.position as { x: number; y: number } | undefined;
						if (newPosition && existingPosition && (newPosition.x !== existingPosition.x || newPosition.y !== existingPosition.y)) {
							notifications.push(`moved`);
						}

						const existingSize = existingProps.size as { width: number; height: number } | undefined;
						const newSize = props.size as { width: number; height: number } | undefined;
						if (newSize && existingSize && (newSize.width !== existingSize.width || newSize.height !== existingSize.height)) {
							notifications.push(`resized`);
						}

						if (props.rotation !== undefined && props.rotation !== existingProps.rotation) {
							notifications.push(`rotation ${props.rotation}°`);
						}

						const existingZoom = existingProps.zoom as { x: number; y: number; linked?: boolean } | undefined;
						const newZoom = props.zoom as { x: number; y: number; linked?: boolean } | undefined;
						if (newZoom && existingZoom && (newZoom.x !== existingZoom.x || newZoom.y !== existingZoom.y)) {
							notifications.push(`zoom ${Math.round(newZoom.x * 100)}%`);
						}

						// Flip
						const existingFlip = existingProps.flip as { horizontal: boolean; vertical: boolean } | undefined;
						const newFlip = props.flip as { horizontal: boolean; vertical: boolean } | undefined;
						if (newFlip && existingFlip) {
							if (newFlip.horizontal !== existingFlip.horizontal) {
								notifications.push(newFlip.horizontal ? "flip H on" : "flip H off");
							}
							if (newFlip.vertical !== existingFlip.vertical) {
								notifications.push(newFlip.vertical ? "flip V on" : "flip V off");
							}
						}

						// Crop
						const existingCrop = existingProps.crop as
							| { left: number; right: number; top: number; bottom: number; softness: number }
							| undefined;
						const newCrop = props.crop as { left: number; right: number; top: number; bottom: number; softness: number } | undefined;
						if (newCrop && existingCrop) {
							const cropChanged =
								newCrop.left !== existingCrop.left ||
								newCrop.right !== existingCrop.right ||
								newCrop.top !== existingCrop.top ||
								newCrop.bottom !== existingCrop.bottom;
							if (cropChanged) {
								notifications.push("cropped");
							}
							if (newCrop.softness !== existingCrop.softness) {
								notifications.push(`crop softness ${Math.round(newCrop.softness)}px`);
							}
						}

						// Freeze frame
						if (props.freezeFrame !== undefined && props.freezeFrame !== existingProps.freezeFrame) {
							notifications.push(props.freezeFrame ? "freeze on" : "freeze off");
						}
						if (props.freezeFrameTime !== undefined && props.freezeFrameTime !== existingProps.freezeFrameTime) {
							notifications.push(`freeze at ${(props.freezeFrameTime as number).toFixed(2)}s`);
						}
					}

					// Timeline position changes
					if (existingClip) {
						if (updates.startTime !== undefined && updates.startTime !== existingClip.startTime) {
							notifications.push(`moved to ${updates.startTime.toFixed(1)}s`);
						}
						if (updates.duration !== undefined && updates.duration !== existingClip.duration) {
							notifications.push(`duration ${updates.duration.toFixed(1)}s`);
						}
					}

					if (notifications.length > 0) {
						const newNotifications: ClipChangeNotification[] = notifications.map((msg) => ({
							id: `${clipId}-${Date.now()}-${Math.random()}`,
							message: msg,
							timestamp: Date.now(),
						}));

						setClipChangeNotifications((prev) => {
							const next = new Map(prev);
							const existing = next.get(clipId) || [];
							next.set(clipId, [...existing, ...newNotifications]);
							return next;
						});
					}

					setTimelineState((prev) => {
						const targetTrack = prev.tracks.find((t) => t.id === trackId);
						const clipInTargetTrack = targetTrack?.clips.find((c) => c.id === clipId);

						let intermediateState: TimelineState;
						let updatedClip: Clip;

						if (clipInTargetTrack) {
							updatedClip = {
								...clipInTargetTrack,
								...updates,
								thumbnail: updates.thumbnail || clipInTargetTrack.thumbnail,
							} as Clip;

							intermediateState = {
								...prev,
								tracks: prev.tracks.map((t) =>
									t.id === trackId
										? {
												...t,
												clips: t.clips.map((c) => (c.id === clipId ? updatedClip : c)),
										  }
										: t
								),
							};
						} else {
							let sourceTrackId: string | null = null;
							let originalClip: Clip | null = null;

							for (const track of prev.tracks) {
								const found = track.clips.find((c) => c.id === clipId);
								if (found) {
									sourceTrackId = track.id;
									originalClip = found;
									break;
								}
							}

							if (!sourceTrackId || !originalClip) {
								return prev;
							}

							updatedClip = {
								...originalClip,
								...updates,
								thumbnail: updates.thumbnail || originalClip.thumbnail,
							} as Clip;

							intermediateState = {
								...prev,
								tracks: prev.tracks.map((t) => {
									if (t.id === sourceTrackId) {
										return {
											...t,
											clips: t.clips.filter((c) => c.id !== clipId),
										};
									}
									if (t.id === trackId) {
										return {
											...t,
											clips: [...t.clips, updatedClip],
										};
									}
									return t;
								}),
							};
						}

						const result = placeClipOnTimeline(updatedClip, trackId, intermediateState);
						return result.state;
					});
				},
				moveRemoteClip: (oldTrackId: string, newTrackId: string, clipId: string, updates: Partial<Clip>) => {
					setTimelineState((prev) => {
						const oldTrack = prev.tracks.find((t) => t.id === oldTrackId);
						const clip = oldTrack?.clips.find((c) => c.id === clipId);

						if (!clip) return prev;

						const updatedClip = {
							...clip,
							...updates,
							thumbnail: updates.thumbnail || clip.thumbnail,
						} as Clip;

						const intermediateState = {
							...prev,
							tracks: prev.tracks.map((t) => {
								if (t.id === oldTrackId) {
									return {
										...t,
										clips: t.clips.filter((c) => c.id !== clipId),
									};
								}
								if (t.id === newTrackId) {
									return {
										...t,
										clips: [...t.clips, updatedClip],
									};
								}
								return t;
							}),
						};

						const result = placeClipOnTimeline(updatedClip, newTrackId, intermediateState);
						return result.state;
					});
				},
				syncZoneClips: (clips: Array<{ trackId: string; clip: Clip }>) => {
					setTimelineState((prev) => {
						let newState = {
							...prev,
							tracks: prev.tracks.map((t) => ({
								...t,
								clips: [...t.clips],
							})),
						};

						for (const { trackId, clip } of clips) {
							const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
							if (trackIndex === -1) continue;

							const existingClipIndex = newState.tracks[trackIndex].clips.findIndex((c) => c.id === clip.id);
							if (existingClipIndex !== -1) {
								const existingClip = newState.tracks[trackIndex].clips[existingClipIndex];
								newState.tracks[trackIndex].clips[existingClipIndex] = {
									...clip,
									thumbnail: clip.thumbnail || existingClip.thumbnail,
								} as Clip;
							} else {
								let foundInOtherTrack = false;
								for (let i = 0; i < newState.tracks.length; i++) {
									if (i === trackIndex) continue;
									const otherClipIndex = newState.tracks[i].clips.findIndex((c) => c.id === clip.id);
									if (otherClipIndex !== -1) {
										const existingClip = newState.tracks[i].clips[otherClipIndex];
										newState.tracks[i].clips.splice(otherClipIndex, 1);
										const mergedClip = {
											...clip,
											thumbnail: clip.thumbnail || existingClip.thumbnail,
										} as Clip;
										newState.tracks[trackIndex].clips.push(mergedClip);
										newState = placeClipOnTimeline(mergedClip, trackId, newState).state;
										foundInOtherTrack = true;
										break;
									}
								}

								if (!foundInOtherTrack) {
									newState.tracks[trackIndex].clips.push(clip);
									newState = placeClipOnTimeline(clip, trackId, newState).state;
								}
							}
						}

						return newState;
					});

					for (const { clip } of clips) {
						generateAndUpdateThumbnail(clip, setTimelineState);
					}
				},
				splitRemoteClip: (trackId: string, originalClip: Clip, newClip: Clip) => {
					setTimelineState((prev) => {
						let newState = {
							...prev,
							tracks: prev.tracks.map((t) =>
								t.id === trackId
									? {
											...t,
											clips: t.clips.map((c) => {
												if (c.id === originalClip.id) {
													return {
														...originalClip,
														thumbnail: originalClip.thumbnail || c.thumbnail,
													} as Clip;
												}
												return c;
											}),
									  }
									: t
							),
						};

						const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
						if (trackIndex !== -1) {
							const existingNewClip = newState.tracks[trackIndex].clips.find((c) => c.id === newClip.id);
							if (!existingNewClip) {
								newState.tracks[trackIndex].clips.push(newClip);
								newState = placeClipOnTimeline(newClip, trackId, newState).state;
							}
						}

						return newState;
					});

					generateAndUpdateThumbnail(newClip, setTimelineState);
				},
				getState: () => timelineState,
			}),
			[updateTimelineState, timelineState]
		);

		useEffect(() => {
			if (dragState) return;
			onTimelineStateChange(timelineState);
		}, [timelineState, onTimelineStateChange, dragState]);

		useEffect(() => {
			onTransformModeChange?.(transformMode);
		}, [transformMode, onTransformModeChange]);

		useEffect(() => {
			historyStore.push(initialTimelineState);
			setCanUndo(historyStore.canUndo());
			setCanRedo(historyStore.canRedo());
		}, []);

		useEffect(() => {
			const unsubscribe = historyStore.subscribe(() => {
				setCanUndo(historyStore.canUndo());
				setCanRedo(historyStore.canRedo());
			});
			return () => {
				unsubscribe();
			};
		}, []);

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
		const handleClipPlacement = useCallback((clip: Clip, trackId: string, state: TimelineState): PlacementResult => {
			return placeClipOnTimeline(clip, trackId, state);
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

							const clip = {
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

							const result = handleClipPlacement(clip, actualTrackId, prev);

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

								const result = handleClipPlacement(clip, currentDragState.trackId, prev);

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
			calculateSnappedTime,
			handleClipPlacement,
			updateTimelineState,
			onClipUpdated,
			onClipRemoved,
			onClipAdded,
		]);

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

			selectedClips.forEach(({ clipId, trackId }) => {
				onClipRemoved?.(trackId, clipId);
			});

			updateTimelineState((prev) => {
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
		}, [selectedClips, onClipSelect, updateTimelineState, onClipRemoved]);

		const handleCutClips = useCallback(() => {
			if (selectedClips.length === 0) return;

			const clipsToClip: Array<{ clip: Clip; trackId: string }> = [];
			selectedClips.forEach(({ clipId, trackId }) => {
				const track = timelineState.tracks.find((t) => t.id === trackId);
				const clip = track?.clips.find((c) => c.id === clipId);
				if (clip && track) {
					clipsToClip.push({ clip: { ...clip }, trackId });
				}
			});

			setClipboard(clipsToClip);

			selectedClips.forEach(({ clipId, trackId }) => {
				onClipRemoved?.(trackId, clipId);
			});

			updateTimelineState((prev) => {
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
		}, [selectedClips, timelineState, onClipSelect, updateTimelineState, onClipRemoved]);

		const handleCopyClips = useCallback(() => {
			if (selectedClips.length === 0) return;

			const clipsToClip: Array<{ clip: Clip; trackId: string }> = [];
			selectedClips.forEach(({ clipId, trackId }) => {
				const track = timelineState.tracks.find((t) => t.id === trackId);
				const clip = track?.clips.find((c) => c.id === clipId);
				if (clip && track) {
					clipsToClip.push({ clip: { ...clip }, trackId });
				}
			});

			setClipboard(clipsToClip);
		}, [selectedClips, timelineState]);

		const handlePasteClips = useCallback(() => {
			if (!clipboard || clipboard.length === 0) return;

			const minStartTime = Math.min(...clipboard.map((c) => c.clip.startTime));
			const offset = currentTimeRef.current - minStartTime;

			const newClipIds: Array<{ clipId: string; trackId: string }> = [];
			const addedClips: Array<{ trackId: string; clip: Clip }> = [];

			updateTimelineState((prev) => {
				let newState = {
					...prev,
					tracks: prev.tracks.map((t) => ({
						...t,
						clips: [...t.clips],
					})),
				};

				clipboard.forEach(({ clip, trackId }) => {
					const newClip: Clip = {
						...clip,
						id: `clip-${Date.now()}-${Math.random()}`,
						startTime: Math.max(0, clip.startTime + offset),
					};

					if (newClip.startTime + newClip.duration > prev.duration) {
						newClip.duration = prev.duration - newClip.startTime;
					}

					if (newClip.duration <= 0) return;

					const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
					if (trackIndex !== -1) {
						newState.tracks[trackIndex].clips.push(newClip);
						newState = handleClipPlacement(newClip, trackId, newState).state;
						newClipIds.push({ clipId: newClip.id, trackId });
						addedClips.push({ trackId, clip: newClip });
					}
				});

				return newState;
			});

			addedClips.forEach(({ trackId, clip }) => {
				onClipAdded?.(trackId, clip);
			});

			setSelectedClips(newClipIds);
			if (newClipIds.length > 0) {
				setLastSelectedClip(newClipIds[0]);
			}
		}, [clipboard, currentTimeRef, handleClipPlacement, updateTimelineState, onClipAdded]);

		const handleUndo = useCallback(() => {
			const currentState = timelineStateRef.current;
			const previousState = historyStore.undo();
			if (previousState) {
				const currentClipMap = new Map<string, { clip: Clip; trackId: string }>();
				const previousClipMap = new Map<string, { clip: Clip; trackId: string }>();

				currentState.tracks.forEach((track) => {
					track.clips.forEach((clip) => {
						currentClipMap.set(clip.id, { clip, trackId: track.id });
					});
				});

				previousState.tracks.forEach((track) => {
					track.clips.forEach((clip) => {
						previousClipMap.set(clip.id, { clip, trackId: track.id });
					});
				});

				currentClipMap.forEach(({ trackId }, clipId) => {
					if (!previousClipMap.has(clipId)) {
						onClipRemoved?.(trackId, clipId);
					}
				});

				previousClipMap.forEach(({ clip, trackId }, clipId) => {
					const currentEntry = currentClipMap.get(clipId);
					if (!currentEntry) {
						onClipAdded?.(trackId, clip);
					} else if (!clipsEqual(currentEntry.clip, clip)) {
						onClipUpdated?.(trackId, clip);
					}
				});

				setTimelineState(previousState);
				setSelectedClips([]);
				setLastSelectedClip(null);
				onClipSelect?.(null);
			}
		}, [onClipSelect, onClipAdded, onClipUpdated, onClipRemoved]);

		const handleRedo = useCallback(() => {
			const currentState = timelineStateRef.current;
			const nextState = historyStore.redo();
			if (nextState) {
				const currentClipMap = new Map<string, { clip: Clip; trackId: string }>();
				const nextClipMap = new Map<string, { clip: Clip; trackId: string }>();

				currentState.tracks.forEach((track) => {
					track.clips.forEach((clip) => {
						currentClipMap.set(clip.id, { clip, trackId: track.id });
					});
				});

				nextState.tracks.forEach((track) => {
					track.clips.forEach((clip) => {
						nextClipMap.set(clip.id, { clip, trackId: track.id });
					});
				});

				currentClipMap.forEach(({ trackId }, clipId) => {
					if (!nextClipMap.has(clipId)) {
						onClipRemoved?.(trackId, clipId);
					}
				});

				nextClipMap.forEach(({ clip, trackId }, clipId) => {
					const currentEntry = currentClipMap.get(clipId);
					if (!currentEntry) {
						onClipAdded?.(trackId, clip);
					} else if (!clipsEqual(currentEntry.clip, clip)) {
						onClipUpdated?.(trackId, clip);
					}
				});

				setTimelineState(nextState);
				setSelectedClips([]);
				setLastSelectedClip(null);
				onClipSelect?.(null);
			}
		}, [onClipSelect, onClipAdded, onClipUpdated, onClipRemoved]);

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
					const previewType = mediaItem.type === "image" ? "video" : mediaItem.type;
					const newPreview = {
						trackId,
						startTime: dragTime,
						duration: clipDuration,
						type: previewType,
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

					let newClip: Clip;

					if (mediaItem.type === "video") {
						newClip = {
							id: `clip-${Date.now()}-${Math.random()}`,
							type: "video",
							name: mediaItem.name,
							src: mediaItem.url,
							startTime: dropTime,
							duration: clipDuration,
							sourceIn: 0,
							sourceDuration: mediaItem.duration,
							thumbnail: mediaItem.thumbnail,
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
						};
					} else if (mediaItem.type === "image") {
						newClip = {
							id: `clip-${Date.now()}-${Math.random()}`,
							type: "image",
							name: mediaItem.name,
							src: mediaItem.url,
							startTime: dropTime,
							duration: clipDuration,
							sourceIn: 0,
							sourceDuration: mediaItem.duration,
							thumbnail: mediaItem.thumbnail,
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
						};
					} else {
						newClip = {
							id: `clip-${Date.now()}-${Math.random()}`,
							type: "audio",
							name: mediaItem.name,
							src: mediaItem.url,
							startTime: dropTime,
							duration: clipDuration,
							sourceIn: 0,
							sourceDuration: mediaItem.duration,
							thumbnail: mediaItem.thumbnail,
							properties: {
								volume: 1.0,
								pan: 0,
								pitch: 0,
								speed: 1,
							},
						};
					}

					updateTimelineState((prev) => {
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

						const expectedTrackType = mediaItem.type === "image" ? "video" : mediaItem.type;
						if (track.type !== expectedTrackType) return prev;

						newState.tracks[trackIndex].clips.push(newClip);

						return handleClipPlacement(newClip, trackId, newState).state;
					});

					onClipAdded?.(trackId, newClip);
				} catch (err) {
					console.error("Error handling media drop:", err);
				}
			},
			[pixelsPerSecond, timelineState.duration, handleClipPlacement, updateTimelineState, onClipAdded]
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

				let leftPartResult: Clip | null = null;
				let rightPartResult: Clip | null = null;

				updateTimelineState((prev) => {
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

					const leftPart: Clip = {
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

					leftPartResult = leftPart;
					rightPartResult = rightPart;

					// replace original with left part and add right part
					newState.tracks[trackIndex].clips[clipIndex] = leftPart;
					newState.tracks[trackIndex].clips.push(rightPart);

					return newState;
				});

				if (leftPartResult && rightPartResult) {
					onClipSplit?.(trackId, leftPartResult, rightPartResult);
				}
			},
			[toolMode, pixelsPerSecond, updateTimelineState, onClipSplit]
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
				} else if (e.key === "t" || e.key === "T") {
					e.preventDefault();
					setTransformMode((prev) => (prev === "transform" ? null : "transform"));
				} else if (e.key === "c" && !e.ctrlKey) {
					e.preventDefault();
					setTransformMode((prev) => (prev === "crop" ? null : "crop"));
				} else if (e.key === "n" || e.key === "N") {
					e.preventDefault();
					setIsSnappingEnabled((prev) => !prev);
				} else if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
					e.preventDefault();
					handleZoomIn();
				} else if (e.ctrlKey && e.key === "-") {
					e.preventDefault();
					handleZoomOut();
				} else if (e.ctrlKey && e.key === "x") {
					e.preventDefault();
					handleCutClips();
				} else if (e.ctrlKey && e.key === "c") {
					e.preventDefault();
					handleCopyClips();
				} else if (e.ctrlKey && e.key === "v") {
					e.preventDefault();
					handlePasteClips();
				} else if (e.ctrlKey && e.key === "z") {
					e.preventDefault();
					handleUndo();
				} else if (e.ctrlKey && e.key === "y") {
					e.preventDefault();
					handleRedo();
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
		}, [
			selectedClips,
			onClipSelect,
			handleDeleteClip,
			handleCutClips,
			handleCopyClips,
			handlePasteClips,
			handleUndo,
			handleRedo,
			handleZoomIn,
			handleZoomOut,
			handlePlayPause,
		]);

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
			if (!showTransformMenu) return;

			const handleClickOutside = (e: MouseEvent) => {
				setShowTransformMenu(false);
			};

			setTimeout(() => {
				document.addEventListener("click", handleClickOutside);
			}, 0);

			return () => {
				document.removeEventListener("click", handleClickOutside);
			};
		}, [showTransformMenu]);

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
			<div className="h-full bg-background border-t border-border flex flex-col">
				<div className="h-10 bg-card border-b border-border flex items-center justify-between px-4">
					<div className="flex items-center gap-3">
						<button
							onClick={handlePlayPause}
							className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
							title={isPlaying ? "Pause" : "Play"}
						>
							{isPlaying ? <HugeiconsIcon icon={PauseIcon} size={16} /> : <HugeiconsIcon icon={PlayIcon} size={16} />}
						</button>
						<div className="w-px h-6 bg-border" />
						<div className="flex items-center gap-1">
							<button
								onClick={() => setToolMode("select")}
								className={`p-1.5 rounded ${
									toolMode === "select"
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:bg-accent hover:text-foreground"
								}`}
								title="Select Mode (A)"
							>
								<HugeiconsIcon icon={Cursor01Icon} size={16} />
							</button>
							<button
								onClick={() => setToolMode("blade")}
								className={`p-1.5 rounded ${
									toolMode === "blade"
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:bg-accent hover:text-foreground"
								}`}
								title="Blade Mode (B)"
							>
								<HugeiconsIcon icon={ScissorIcon} size={16} />
							</button>
							<div className="relative">
								<button
									onClick={() => {
										if (transformMode) {
											setTransformMode(null);
											setShowTransformMenu(false);
										} else {
											setTransformMode("transform");
										}
									}}
									className={`p-1.5 rounded ${
										transformMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
									}`}
									title="Transform Mode"
								>
									{transformMode === "crop" ? <HugeiconsIcon icon={CropIcon} size={16} /> : <HugeiconsIcon icon={SquareIcon} size={16} />}
								</button>
								<button
									onClick={() => setShowTransformMenu(!showTransformMenu)}
									className="p-1.5 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
									title="Transform options"
								>
									<HugeiconsIcon icon={ArrowDown01Icon} size={12} />
								</button>
								{showTransformMenu && (
									<div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded shadow-lg z-50 min-w-[120px]">
										<button
											onClick={() => {
												setTransformMode("transform");
												setShowTransformMenu(false);
											}}
											className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
										>
											<HugeiconsIcon icon={SquareIcon} size={14} />
											Transform
										</button>
										<button
											onClick={() => {
												setTransformMode("crop");
												setShowTransformMenu(false);
											}}
											className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
										>
											<HugeiconsIcon icon={CropIcon} size={14} />
											Crop
										</button>
									</div>
								)}
							</div>
						</div>
						<div className="w-px h-6 bg-border" />
						<button
							onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}
							className={`p-1.5 rounded ${
								isSnappingEnabled ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
							}`}
							title={isSnappingEnabled ? "Snapping Enabled (N)" : "Snapping Disabled (N)"}
						>
							<HugeiconsIcon icon={MagnetIcon} size={16} />
						</button>
						<div className="w-px h-6 bg-border" />
						<div className="flex items-center gap-1">
							<button
								onClick={handleUndo}
								disabled={!canUndo}
								className={`p-1.5 rounded ${
									canUndo ? "text-muted-foreground hover:bg-accent hover:text-foreground" : "text-muted-foreground/40 cursor-not-allowed"
								}`}
								title="Undo (Ctrl+Z)"
							>
								<HugeiconsIcon icon={Undo02Icon} size={16} />
							</button>
							<button
								onClick={handleRedo}
								disabled={!canRedo}
								className={`p-1.5 rounded ${
									canRedo ? "text-muted-foreground hover:bg-accent hover:text-foreground" : "text-muted-foreground/40 cursor-not-allowed"
								}`}
								title="Redo (Ctrl+Y)"
							>
								<HugeiconsIcon icon={Redo02Icon} size={16} />
							</button>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-1">
							<button
								onClick={handleZoomOut}
								className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
								title="Zoom out"
							>
								<HugeiconsIcon icon={SearchMinusIcon} size={16} />
							</button>
							<span className="text-xs text-muted-foreground w-12 text-center">{Math.round((pixelsPerSecond / 50) * 100)}%</span>
							<button
								onClick={handleZoomIn}
								className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
								title="Zoom in"
							>
								<HugeiconsIcon icon={SearchAddIcon} size={16} />
							</button>
						</div>
					</div>
				</div>

				<div className="flex-1 flex overflow-hidden relative">
					<div className="w-32 shrink-0 bg-card border-r border-border flex flex-col relative z-70">
						<div className="h-8 border-b border-border flex items-center justify-center relative shrink-0 bg-card z-10">
							<span className="text-sm text-foreground font-mono tabular-nums">
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
						<div className="flex-1 overflow-hidden relative">
							<div ref={trackNamesRef} className="absolute left-0 right-0">
								{timelineState.tracks.map((track, index) => (
									<div
										key={track.id}
										className={`h-10 flex items-center px-3 bg-card ${
											index !== timelineState.tracks.length - 1 ? "border-b border-border" : ""
										}`}
									>
										<div className="flex items-center gap-2">
											<div className={`w-2 h-2 rounded-full ${track.type === "video" ? "bg-purple-500" : "bg-green-500"}`} />
											<span className="text-sm text-foreground font-medium">
												{track.type === "video" ? "V" : "A"}
												{parseInt(track.id.split("-")[1]) + 1}
											</span>
										</div>
									</div>
								))}
							</div>
						</div>
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
						onScroll={(e) => {
							const container = e.currentTarget;
							if (trackNamesRef.current) {
								trackNamesRef.current.style.transform = `translateY(${-container.scrollTop}px)`;
							}
						}}
					>
						<div className="min-w-full inline-block" style={{ width: `${timelineWidth + 200}px` }}>
							<div ref={timelineRef} className="sticky top-0 z-20 bg-card">
								<TimeRuler duration={timelineState.duration} pixelsPerSecond={pixelsPerSecond} onSeek={handleSeek} />
							</div>

							<div className="relative">
								{timelineState.tracks.map((track, index) => (
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
											isLastTrack={index === timelineState.tracks.length - 1}
											onTrackMouseMove={handleTrackMouseMove}
											bladeCursorPosition={bladeCursorPosition?.trackId === track.id ? bladeCursorPosition.x : null}
											onMediaDrop={handleMediaDrop}
											onMediaDragOver={handleMediaDragOver}
											onMediaDragLeave={handleMediaDragLeave}
											dragPreview={dragPreview}
											remoteSelections={remoteSelections}
											clipChangeNotifications={clipChangeNotifications}
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
