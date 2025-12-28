"use client";

import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { TimelineState, Clip, VideoClip, ImageClip, AudioClip } from "../types/timeline";
import TimelineTrack from "./TimelineTrack";
import TimeRuler from "./TimeRuler";
import type { RemoteSelection } from "./MatchWS";
import type { ClipChangeNotification } from "./TimelineClip";
import { getCurrentDragItem } from "./MediaCardDock";
import { historyStore } from "../store/historyStore";
import { toast } from "sonner";

import {
	initialTimelineState,
	clipsEqual,
	generateAndUpdateThumbnail,
	placeClipOnTimeline,
	calculatePlayheadSnappedTime,
	createNewClip,
} from "./timeline/utils";
import TimelineToolbar, { ToolMode, TransformMode } from "./timeline/TimelineToolbar";
import { useTimelineDrag } from "../hooks/useTimelineDrag";
import { useTimelineSelection } from "../hooks/useTimelineSelection";
import { useTimelineKeyboard } from "../hooks/useTimelineKeyboard";
import { useTimelineClipboard } from "../hooks/useTimelineClipboard";

function deepMergeProperties(existing: Record<string, unknown>, updates: Record<string, unknown>): Record<string, unknown> {
	const result = { ...existing };
	for (const key of Object.keys(updates)) {
		const updateValue = updates[key];
		const existingValue = existing[key];
		if (
			updateValue !== null &&
			typeof updateValue === "object" &&
			!Array.isArray(updateValue) &&
			existingValue !== null &&
			typeof existingValue === "object" &&
			!Array.isArray(existingValue)
		) {
			result[key] = deepMergeProperties(existingValue as Record<string, unknown>, updateValue as Record<string, unknown>);
		} else if (updateValue !== undefined) {
			result[key] = updateValue;
		}
	}
	return result;
}

interface TimelineProps {
	onClipSelect?: (selection: { clip: Clip; trackId: string }[] | null) => void;
	currentTime: number;
	currentTimeRef: React.RefObject<number>;
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
	canAddClip?: () => { allowed: boolean; reason?: string };
	canSplitClip?: () => { allowed: boolean; reason?: string };
	clipSizeMin?: number;
	clipSizeMax?: number;
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
			canAddClip,
			canSplitClip,
			clipSizeMin,
			clipSizeMax,
		},
		ref
	) => {
		// state
		const [timelineState, setTimelineState] = useState<TimelineState>(initialTimelineState);
		const [pixelsPerSecond, setPixelsPerSecond] = useState(50);
		const [toolMode, setToolMode] = useState<ToolMode>("select");
		const [transformMode, setTransformMode] = useState<TransformMode>(null);
		const [showTransformMenu, setShowTransformMenu] = useState(false);
		const [isSnappingEnabled, setIsSnappingEnabled] = useState(true);
		const [canUndo, setCanUndo] = useState(false);
		const [canRedo, setCanRedo] = useState(false);
		const [bladeCursorPosition, setBladeCursorPosition] = useState<{ x: number; trackId: string } | null>(null);
		const [dragPreview, setDragPreview] = useState<{
			trackId: string;
			startTime: number;
			duration: number;
			type: "video" | "audio";
		} | null>(null);
		const [clipChangeNotifications, setClipChangeNotifications] = useState<Map<string, ClipChangeNotification[]>>(new Map());

		// Refs
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
		const timelineStateRef = useRef<TimelineState>(timelineState);
		timelineStateRef.current = timelineState;

		// Snap points cache
		const snapPointsCache = useMemo(() => {
			const points: number[] = [0, timelineState.duration];
			timelineState.tracks.forEach((track) => {
				track.clips.forEach((clip) => {
					points.push(clip.startTime, clip.startTime + clip.duration);
				});
			});
			return points;
		}, [timelineState]);

		// Update timeline state with history
		const updateTimelineState = useCallback((updater: (prev: TimelineState) => TimelineState) => {
			setTimelineState((prev) => {
				const newState = updater(prev);
				historyStore.push(newState);
				return newState;
			});
		}, []);

		// Selection hook
		const { selectedClips, setSelectedClips, lastSelectedClip, setLastSelectedClip, handleClipSelect, clearSelection } =
			useTimelineSelection({
				timelineState,
				onClipSelect,
			});

		// Drag hook
		const { dragState, hoveredTrackId, setHoveredTrackId, handleClipDragStart } = useTimelineDrag({
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
			clipSizeMin,
			clipSizeMax,
		});

		// Clipboard hook
		const { handleCutClips, handleCopyClips, handlePasteClips, handleDeleteClip } = useTimelineClipboard({
			selectedClips,
			timelineState,
			currentTimeRef,
			updateTimelineState,
			setSelectedClips,
			setLastSelectedClip,
			onClipSelect,
			onClipAdded,
			onClipRemoved,
			canAddClip,
		});

		// Undo/Redo handlers
		const handleUndo = useCallback(() => {
			const currentState = timelineState;
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
		}, [timelineState, onClipSelect, onClipAdded, onClipUpdated, onClipRemoved, setSelectedClips, setLastSelectedClip]);

		const handleRedo = useCallback(() => {
			const currentState = timelineState;
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
		}, [timelineState, onClipSelect, onClipAdded, onClipUpdated, onClipRemoved, setSelectedClips, setLastSelectedClip]);

		// Zoom handlers
		const handleZoomIn = useCallback(() => {
			setPixelsPerSecond((prev) => Math.min(prev + 10, 200));
		}, []);

		const handleZoomOut = useCallback(() => {
			setPixelsPerSecond((prev) => Math.max(prev - 10, 10));
		}, []);

		// Play/Pause handler
		const handlePlayPause = useCallback(() => {
			onPlayingChange(!isPlaying);
		}, [isPlaying, onPlayingChange]);

		// Keyboard hook
		useTimelineKeyboard({
			selectedClipsCount: selectedClips.length,
			onPlayPause: handlePlayPause,
			onToolModeChange: setToolMode,
			onTransformModeChange: setTransformMode,
			onSnappingToggle: () => setIsSnappingEnabled((prev) => !prev),
			onZoomIn: handleZoomIn,
			onZoomOut: handleZoomOut,
			onCut: handleCutClips,
			onCopy: handleCopyClips,
			onPaste: handlePasteClips,
			onUndo: handleUndo,
			onRedo: handleRedo,
			onDelete: handleDeleteClip,
			onClearSelection: clearSelection,
			transformMode,
		});

		// Imperative handle for remote operations
		useImperativeHandle(
			ref,
			() => ({
				updateClip: (trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<ImageClip> | Partial<AudioClip>) => {
					updateTimelineState((prev) => ({
						...prev,
						tracks: prev.tracks.map((t) =>
							t.id === trackId
								? {
										...t,
										clips: t.clips.map((c) => {
											if (c.id === clipId) {
												if (c.type === "video") {
													return { ...c, ...updates } as VideoClip;
												} else if (c.type === "image") {
													return { ...c, ...updates } as ImageClip;
												} else {
													return { ...c, ...updates } as AudioClip;
												}
											}
											return c;
										}),
								  }
								: t
						),
					}));
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
							tracks: prev.tracks.map((t) => ({ ...t, clips: [...t.clips] })),
						};
						const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
						if (trackIndex === -1) return prev;
						if (newState.tracks[trackIndex].clips.find((c) => c.id === clip.id)) return prev;
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
							tracks: prev.tracks.map((t) => (t.id === foundTrackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t)),
						};
					});
				},
				updateRemoteClip: (trackId: string, clipId: string, updates: Partial<Clip>) => {
					let existingClip: Clip | undefined;
					for (const track of timelineStateRef.current.tracks) {
						const found = track.clips.find((c) => c.id === clipId);
						if (found) {
							existingClip = found;
							break;
						}
					}

					const notifications: string[] = [];

					if (existingClip && updates.properties) {
						const props = updates.properties as unknown as Record<string, unknown>;
						const existingProps = existingClip.properties as unknown as Record<string, unknown>;

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

						const existingFlip = existingProps.flip as { horizontal?: boolean; vertical?: boolean } | undefined;
						const newFlip = props.flip as { horizontal?: boolean; vertical?: boolean } | undefined;
						if (newFlip && existingFlip) {
							if (newFlip.horizontal !== undefined && newFlip.horizontal !== existingFlip.horizontal) {
								notifications.push(newFlip.horizontal ? "flip H on" : "flip H off");
							}
							if (newFlip.vertical !== undefined && newFlip.vertical !== existingFlip.vertical) {
								notifications.push(newFlip.vertical ? "flip V on" : "flip V off");
							}
						}

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

						if (props.freezeFrame !== undefined && props.freezeFrame !== existingProps.freezeFrame) {
							notifications.push(props.freezeFrame ? "freeze on" : "freeze off");
						}
						if (props.freezeFrameTime !== undefined && props.freezeFrameTime !== existingProps.freezeFrameTime) {
							notifications.push(`freeze at ${(props.freezeFrameTime as number).toFixed(2)}s`);
						}
					}

					if (existingClip) {
						const props = updates.properties as unknown as Record<string, unknown> | undefined;
						const speedChanged = props?.speed !== undefined;

						if (updates.startTime !== undefined && updates.startTime !== existingClip.startTime) {
							notifications.push(`moved to ${updates.startTime.toFixed(1)}s`);
						}
						if (updates.duration !== undefined && updates.duration !== existingClip.duration && !speedChanged) {
							notifications.push(`duration ${updates.duration.toFixed(1)}s`);
						}
					}

					if (notifications.length > 0) {
						const newNotifications: ClipChangeNotification[] = notifications.map((msg) => ({
							id: `${clipId}-${Date.now()}-${Math.random()}`,
							message: msg,
							timestamp: Date.now(),
						}));
						setClipChangeNotifications((prevNotifs) => {
							const next = new Map(prevNotifs);
							const existing = next.get(clipId) || [];
							next.set(clipId, [...existing, ...newNotifications]);
							return next;
						});
					}

					setTimelineState((prev) => {
						let clipToUpdate: Clip | undefined;
						let sourceTrackId: string | null = null;
						for (const track of prev.tracks) {
							const found = track.clips.find((c) => c.id === clipId);
							if (found) {
								clipToUpdate = found;
								sourceTrackId = track.id;
								break;
							}
						}

						if (!clipToUpdate) return prev;

						const mergedProperties = updates.properties
							? deepMergeProperties(
									clipToUpdate.properties as unknown as Record<string, unknown>,
									updates.properties as unknown as Record<string, unknown>
							  )
							: clipToUpdate.properties;

						const targetTrack = prev.tracks.find((t) => t.id === trackId);
						const clipInTargetTrack = targetTrack?.clips.find((c) => c.id === clipId);
						let intermediateState: TimelineState;
						let updatedClip: Clip;

						if (clipInTargetTrack) {
							updatedClip = {
								...clipInTargetTrack,
								...updates,
								properties: mergedProperties,
								thumbnail: updates.thumbnail || clipInTargetTrack.thumbnail,
							} as Clip;
							intermediateState = {
								...prev,
								tracks: prev.tracks.map((t) =>
									t.id === trackId ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? updatedClip : c)) } : t
								),
							};
						} else {
							updatedClip = {
								...clipToUpdate,
								...updates,
								properties: mergedProperties,
								thumbnail: updates.thumbnail || clipToUpdate.thumbnail,
							} as Clip;
							intermediateState = {
								...prev,
								tracks: prev.tracks.map((t) => {
									if (t.id === sourceTrackId) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
									if (t.id === trackId) return { ...t, clips: [...t.clips, updatedClip] };
									return t;
								}),
							};
						}
						return placeClipOnTimeline(updatedClip, trackId, intermediateState).state;
					});
				},
				moveRemoteClip: (oldTrackId: string, newTrackId: string, clipId: string, updates: Partial<Clip>) => {
					setTimelineState((prev) => {
						const oldTrack = prev.tracks.find((t) => t.id === oldTrackId);
						const clip = oldTrack?.clips.find((c) => c.id === clipId);
						if (!clip) return prev;
						const updatedClip = { ...clip, ...updates, thumbnail: updates.thumbnail || clip.thumbnail } as Clip;
						const intermediateState = {
							...prev,
							tracks: prev.tracks.map((t) => {
								if (t.id === oldTrackId) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
								if (t.id === newTrackId) return { ...t, clips: [...t.clips, updatedClip] };
								return t;
							}),
						};
						return placeClipOnTimeline(updatedClip, newTrackId, intermediateState).state;
					});
				},
				syncZoneClips: (clips: Array<{ trackId: string; clip: Clip }>) => {
					setTimelineState((prev) => {
						let newState = { ...prev, tracks: prev.tracks.map((t) => ({ ...t, clips: [...t.clips] })) };
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
										const mergedClip = { ...clip, thumbnail: clip.thumbnail || existingClip.thumbnail } as Clip;
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
											clips: t.clips.map((c) =>
												c.id === originalClip.id ? ({ ...originalClip, thumbnail: originalClip.thumbnail || c.thumbnail } as Clip) : c
											),
									  }
									: t
							),
						};
						const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
						if (trackIndex !== -1 && !newState.tracks[trackIndex].clips.find((c) => c.id === newClip.id)) {
							newState.tracks[trackIndex].clips.push(newClip);
							newState = placeClipOnTimeline(newClip, trackId, newState).state;
						}
						return newState;
					});
					generateAndUpdateThumbnail(newClip, setTimelineState);
				},
				getState: () => timelineState,
			}),
			[updateTimelineState, timelineState, setSelectedClips, setLastSelectedClip]
		);

		// notify parent of timeline state changes
		useEffect(() => {
			if (dragState) return;
			onTimelineStateChange(timelineState);
		}, [timelineState, onTimelineStateChange, dragState]);

		// notify parent of transform mode changes
		useEffect(() => {
			onTransformModeChange?.(transformMode);
		}, [transformMode, onTransformModeChange]);

		// initialize history
		useEffect(() => {
			historyStore.push(initialTimelineState);
			setCanUndo(historyStore.canUndo());
			setCanRedo(historyStore.canRedo());
		}, []);

		// subscribe to history changes
		useEffect(() => {
			const unsubscribe = historyStore.subscribe(() => {
				setCanUndo(historyStore.canUndo());
				setCanRedo(historyStore.canRedo());
			});
			return () => {
				unsubscribe();
			};
		}, []);

		// update selected clips when timeline changes
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

		// update playhead position when not playing
		useEffect(() => {
			if (!isPlaying && playheadElementRef.current) {
				const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
				playheadElementRef.current.style.transform = `translateX(${currentTime * pixelsPerSecond - scrollLeft}px)`;
			}
		}, [currentTime, pixelsPerSecond, isPlaying]);

		// playback animation loop
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

		// close transform menu on outside click
		useEffect(() => {
			if (!showTransformMenu) return;
			const handleClickOutside = () => setShowTransformMenu(false);
			setTimeout(() => document.addEventListener("click", handleClickOutside), 0);
			return () => document.removeEventListener("click", handleClickOutside);
		}, [showTransformMenu]);

		// handle scroll sync with playhead
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
		}, [pixelsPerSecond, currentTimeRef]);

		// handle horizontal scroll with ctrl+wheel
		useEffect(() => {
			const scrollContainer = scrollContainerRef.current;
			if (!scrollContainer) return;
			const handleWheel = (e: WheelEvent) => {
				if (e.ctrlKey) {
					e.preventDefault();
					scrollContainer.scrollLeft += e.deltaY;
				}
			};
			scrollContainer.addEventListener("wheel", handleWheel, { passive: false });
			return () => scrollContainer.removeEventListener("wheel", handleWheel);
		}, []);

		// seek handler with snapping
		const handleSeek = useCallback(
			(time: number) => {
				const snappedTime = calculatePlayheadSnappedTime(time, isSnappingEnabled, snapPointsCache);
				currentTimeRef.current = snappedTime;
				onTimeChange(snappedTime);
				if (isPlaying) {
					playbackStartTimeRef.current = performance.now();
					playbackStartPositionRef.current = snappedTime;
				}
			},
			[currentTimeRef, onTimeChange, isPlaying, isSnappingEnabled, snapPointsCache]
		);

		// timeline click handler (deselect)
		const handleTimelineClick = useCallback(() => clearSelection(), [clearSelection]);

		// track mouse move for blade cursor
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
				if (!last || last.trackId !== trackId || Math.abs(last.x - snappedX) > 1) {
					lastBladeCursorRef.current = { x: snappedX, trackId };
					setBladeCursorPosition({ x: snappedX, trackId });
				}
			},
			[toolMode, pixelsPerSecond]
		);

		// media drag over handler
		const handleMediaDragOver = useCallback(
			(e: React.DragEvent, trackId: string) => {
				e.preventDefault();

				if (canAddClip) {
					const check = canAddClip();
					if (!check.allowed) {
						e.dataTransfer.dropEffect = "none";
						if (lastDragPreviewRef.current !== null) {
							lastDragPreviewRef.current = null;
							setDragPreview(null);
						}
						return;
					}
				}

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
				if (
					!last ||
					last.trackId !== trackId ||
					Math.abs(last.startTime - dragTime) > 0.01 ||
					Math.abs(last.duration - clipDuration) > 0.01
				) {
					const previewType = mediaItem.type === "image" ? "video" : mediaItem.type;
					const newPreview = { trackId, startTime: dragTime, duration: clipDuration, type: previewType };
					lastDragPreviewRef.current = newPreview;
					setDragPreview(newPreview);
				}
			},
			[pixelsPerSecond, timelineState.duration, canAddClip]
		);

		// media drop handler
		const handleMediaDrop = useCallback(
			(e: React.DragEvent, trackId: string) => {
				setDragPreview(null);
				try {
					if (canAddClip) {
						const check = canAddClip();
						if (!check.allowed) {
							toast.error(check.reason || "Cannot add clip");
							return;
						}
					}

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

					const newClip = createNewClip(mediaItem, dropTime, clipDuration);

					updateTimelineState((prev) => {
						const newState = { ...prev, tracks: prev.tracks.map((t) => ({ ...t, clips: [...t.clips] })) };
						const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
						if (trackIndex === -1) return prev;
						const track = newState.tracks[trackIndex];
						const expectedTrackType = mediaItem.type === "image" ? "video" : mediaItem.type;
						if (track.type !== expectedTrackType) return prev;
						newState.tracks[trackIndex].clips.push(newClip);
						return placeClipOnTimeline(newClip, trackId, newState).state;
					});

					onClipAdded?.(trackId, newClip);
				} catch (err) {
					console.error("Error handling media drop:", err);
				}
			},
			[pixelsPerSecond, timelineState.duration, updateTimelineState, onClipAdded, canAddClip]
		);

		const handleMediaDragLeave = useCallback(() => {
			lastDragPreviewRef.current = null;
			setDragPreview(null);
		}, []);

		// blade click handler
		const handleBladeClick = useCallback(
			(e: React.MouseEvent, trackId: string) => {
				if (toolMode !== "blade") return;
				e.stopPropagation();

				if (canSplitClip) {
					const check = canSplitClip();
					if (!check.allowed) {
						toast.error(check.reason || "Cannot split clip");
						return;
					}
				}

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
					const newState = { ...prev, tracks: prev.tracks.map((t) => ({ ...t, clips: [...t.clips] })) };
					const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
					if (trackIndex === -1) return prev;
					const track = newState.tracks[trackIndex];
					const clipIndex = track.clips.findIndex((c) => clickTime >= c.startTime && clickTime < c.startTime + c.duration);
					if (clipIndex === -1) return prev;
					const clipToSplit = track.clips[clipIndex];
					if (clickTime <= clipToSplit.startTime || clickTime >= clipToSplit.startTime + clipToSplit.duration - frameTime) return prev;

					const leftPart: Clip = { ...clipToSplit, duration: clickTime - clipToSplit.startTime };
					const timelineOffset = clickTime - clipToSplit.startTime;
					const speed = clipToSplit.type === "video" ? (clipToSplit as VideoClip).properties.speed : 1;
					const sourceOffset = timelineOffset * speed;
					const rightPart: Clip = {
						...clipToSplit,
						id: `${clipToSplit.id}-split-${Date.now()}`,
						startTime: clickTime,
						duration: clipToSplit.startTime + clipToSplit.duration - clickTime,
						sourceIn: clipToSplit.sourceIn + sourceOffset,
					};

					leftPartResult = leftPart;
					rightPartResult = rightPart;
					newState.tracks[trackIndex].clips[clipIndex] = leftPart;
					newState.tracks[trackIndex].clips.push(rightPart);
					return newState;
				});

				if (leftPartResult && rightPartResult) {
					onClipSplit?.(trackId, leftPartResult, rightPartResult);
				}
			},
			[toolMode, pixelsPerSecond, updateTimelineState, onClipSplit, canSplitClip]
		);

		const timelineWidth = timelineState.duration * pixelsPerSecond;

		return (
			<div className="h-full bg-background border-t border-border flex flex-col">
				<TimelineToolbar
					isPlaying={isPlaying}
					onPlayPause={handlePlayPause}
					toolMode={toolMode}
					onToolModeChange={setToolMode}
					transformMode={transformMode}
					onTransformModeChange={setTransformMode}
					showTransformMenu={showTransformMenu}
					onShowTransformMenuChange={setShowTransformMenu}
					isSnappingEnabled={isSnappingEnabled}
					onSnappingChange={setIsSnappingEnabled}
					canUndo={canUndo}
					canRedo={canRedo}
					onUndo={handleUndo}
					onRedo={handleRedo}
					pixelsPerSecond={pixelsPerSecond}
					onZoomIn={handleZoomIn}
					onZoomOut={handleZoomOut}
				/>

				<div className="flex-1 flex overflow-hidden relative">
					{/* Track names column */}
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

					{/* Timeline content */}
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
											if (el) trackRefsMap.current.set(track.id, el);
											else trackRefsMap.current.delete(track.id);
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

					{/* Playhead */}
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
							style={{ left: "1px", transform: "translateX(-50%)", display: "block" }}
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
									newTime = calculatePlayheadSnappedTime(newTime, isSnappingEnabled, snapPointsCache);
									currentTimeRef.current = newTime;
									onTimeChange(newTime);
									if (playheadElementRef.current) {
										const sl = scrollContainerRef.current?.scrollLeft || 0;
										playheadElementRef.current.style.transform = `translateX(${newTime * pixelsPerSecond - sl}px)`;
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
