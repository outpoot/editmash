"use client";

import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle, memo } from "react";
import { TimelineState, Clip, VideoClip, ImageClip, AudioClip } from "../types/timeline";
import TimelineTrack from "./TimelineTrack";
import TimeRuler from "./TimeRuler";
import type { RemoteSelection } from "./MatchWS";
import type { ClipChangeNotification } from "./TimelineClip";
import { getCurrentDragItem } from "./MediaCardDock";
import { historyStore } from "../store/historyStore";
import { mediaStore } from "../store/mediaStore";
import { toast } from "sonner";

import {
	initialTimelineState,
	clipsEqual,
	generateAndUpdateThumbnail,
	placeClipOnTimeline,
	calculatePlayheadSnappedTime,
	calculateSnappedTime,
	createNewClip,
} from "./timeline/utils";
import TimelineToolbar, { ToolMode, TransformMode } from "./timeline/TimelineToolbar";
import { useTimelineDrag } from "../hooks/useTimelineDrag";
import { useTimelineSelection } from "../hooks/useTimelineSelection";
import { useTimelineKeyboard } from "../hooks/useTimelineKeyboard";
import { useTimelineClipboard } from "../hooks/useTimelineClipboard";
import { viewSettingsStore } from "../store/viewSettingsStore";

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
		const [interleaveTracks, setInterleaveTracks] = useState(viewSettingsStore.getSettings().interleaveTracks);

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
		const lastBladeTimeRef = useRef<number>(0);
		const BLADE_COOLDOWN_MS = 300;
		const timelineStateRef = useRef<TimelineState>(timelineState);
		timelineStateRef.current = timelineState;

		const snapPointsCache = useMemo(() => {
			const points: number[] = [0, timelineState.duration];
			timelineState.tracks.forEach((track) => {
				track.clips.forEach((clip) => {
					points.push(clip.startTime, clip.startTime + clip.duration);
				});
			});
			return points;
		}, [timelineState]);

		useEffect(() => {
			return viewSettingsStore.subscribe(() => {
				setInterleaveTracks(viewSettingsStore.getSettings().interleaveTracks);
			});
		}, []);

		const displayTracks = useMemo(() => {
			if (!interleaveTracks) {
				return timelineState.tracks;
			}

			const videoTracks = timelineState.tracks.filter((t) => t.type === "video");
			const audioTracks = timelineState.tracks.filter((t) => t.type === "audio");
			const interleaved = [];
			const maxLength = Math.max(videoTracks.length, audioTracks.length);

			for (let i = 0; i < maxLength; i++) {
				if (i < videoTracks.length) interleaved.push(videoTracks[i]);
				if (i < audioTracks.length) interleaved.push(audioTracks[i]);
			}

			return interleaved;
		}, [timelineState.tracks, interleaveTracks]);

		const updateTimelineState = useCallback((updater: (prev: TimelineState) => TimelineState) => {
			setTimelineState((prev) => {
				const newState = updater(prev);
				queueMicrotask(() => {
					historyStore.push(newState);
				});
				return newState;
			});
		}, []);

		const { selectedClips, setSelectedClips, lastSelectedClip, setLastSelectedClip, handleClipSelect, clearSelection } =
			useTimelineSelection({
				timelineState,
				onClipSelect,
			});

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
			clipSizeMax,
		});

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
		});

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

		const handleZoomIn = useCallback(() => {
			setPixelsPerSecond((prev) => Math.min(prev + 10, 200));
		}, []);

		const handleZoomOut = useCallback(() => {
			setPixelsPerSecond((prev) => Math.max(prev - 10, 10));
		}, []);

		const handlePlayPause = useCallback(() => {
			onPlayingChange(!isPlaying);
		}, [isPlaying, onPlayingChange]);

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

		useEffect(() => {
			const mediaUrlMapRef = { current: new Map<string, string>() };

			const items = mediaStore.getItems();
			for (const item of items) {
				mediaUrlMapRef.current.set(item.id, item.url);
			}

			const handleMediaUpdate = () => {
				const items = mediaStore.getItems();
				let hasChanges = false;
				const updates: Array<{ mediaId: string; oldUrl: string; newUrl: string; thumbnail?: string }> = [];

				for (const item of items) {
					const oldUrl = mediaUrlMapRef.current.get(item.id);
					if (oldUrl && oldUrl !== item.url && !item.isUploading && !item.isDownloading) {
						updates.push({ mediaId: item.id, oldUrl, newUrl: item.url, thumbnail: item.thumbnail });
						hasChanges = true;
					}
					mediaUrlMapRef.current.set(item.id, item.url);
				}

				if (hasChanges) {
					setTimelineState((prev) => {
						let changed = false;
						const newState = {
							...prev,
							tracks: prev.tracks.map((track) => ({
								...track,
								clips: track.clips.map((clip) => {
									for (const update of updates) {
										if (clip.src === update.oldUrl || clip.mediaId === update.mediaId) {
											changed = true;
											return {
												...clip,
												src: update.newUrl,
												thumbnail: update.thumbnail || clip.thumbnail,
												isLoading: false,
											};
										}
									}
									return clip;
								}),
							})),
						};
						return changed ? newState : prev;
					});
				}
			};

			const unsubscribe = mediaStore.subscribe(handleMediaUpdate);
			return () => {
				unsubscribe();
			};
		}, []);

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
					queueMicrotask(() => {
						setTimelineState((prev) => {
							const clipIdToTrackIndex = new Map<string, number>();
							prev.tracks.forEach((track, idx) => {
								track.clips.forEach((c) => clipIdToTrackIndex.set(c.id, idx));
							});

							const trackIdToIndex = new Map<string, number>();
							prev.tracks.forEach((track, idx) => trackIdToIndex.set(track.id, idx));

							const newTracks = prev.tracks.map((t) => ({ ...t, clips: [...t.clips] }));
							let hasChanges = false;

							for (const { trackId, clip } of clips) {
								const trackIndex = trackIdToIndex.get(trackId);
								if (trackIndex === undefined) continue;

								const existingTrackIndex = clipIdToTrackIndex.get(clip.id);

								if (existingTrackIndex !== undefined) {
									const clipIndex = newTracks[existingTrackIndex].clips.findIndex((c) => c.id === clip.id);
									if (clipIndex !== -1) {
										const existingClip = newTracks[existingTrackIndex].clips[clipIndex];
										if (existingTrackIndex === trackIndex) {
											newTracks[trackIndex].clips[clipIndex] = {
												...clip,
												thumbnail: clip.thumbnail || existingClip.thumbnail,
											} as Clip;
										} else {
											newTracks[existingTrackIndex].clips.splice(clipIndex, 1);
											newTracks[trackIndex].clips.push({
												...clip,
												thumbnail: clip.thumbnail || existingClip.thumbnail,
											} as Clip);
											clipIdToTrackIndex.set(clip.id, trackIndex);
										}
										hasChanges = true;
									}
								} else {
									newTracks[trackIndex].clips.push(clip);
									clipIdToTrackIndex.set(clip.id, trackIndex);
									hasChanges = true;
								}
							}

							if (!hasChanges) return prev;
							return { ...prev, tracks: newTracks };
						});

						if ("requestIdleCallback" in window) {
							(window as Window).requestIdleCallback(
								() => {
									for (const { clip } of clips) {
										generateAndUpdateThumbnail(clip, setTimelineState);
									}
								},
								{ timeout: 500 }
							);
						} else {
							setTimeout(() => {
								for (const { clip } of clips) {
									generateAndUpdateThumbnail(clip, setTimelineState);
								}
							}, 100);
						}
					});
				},
				splitRemoteClip: (trackId: string, originalClip: Clip, newClip: Clip) => {
					setTimelineState((prev) => {
						const trackIndex = prev.tracks.findIndex((t) => t.id === trackId);
						if (trackIndex === -1) return prev;

						const track = prev.tracks[trackIndex];
						const originalIndex = track.clips.findIndex((c) => c.id === originalClip.id);

						let newClips: Clip[];
						if (originalIndex !== -1) {
							newClips = track.clips.map((c) =>
								c.id === originalClip.id ? ({ ...originalClip, thumbnail: originalClip.thumbnail || c.thumbnail } as Clip) : c
							);
							if (!newClips.find((c) => c.id === newClip.id)) {
								newClips.push(newClip);
							}
						} else {
							newClips = [...track.clips];
							if (!newClips.find((c) => c.id === newClip.id)) {
								newClips.push(newClip);
							}
						}

						return {
							...prev,
							tracks: prev.tracks.map((t, i) => (i === trackIndex ? { ...t, clips: newClips } : t)),
						};
					});
					generateAndUpdateThumbnail(newClip, setTimelineState);
				},
				getState: () => timelineStateRef.current,
			}),
			[updateTimelineState, setSelectedClips, setLastSelectedClip]
		);

		// notify parent of timeline state changes
		const onTimelineStateChangeRef = useRef(onTimelineStateChange);
		onTimelineStateChangeRef.current = onTimelineStateChange;

		useEffect(() => {
			if (dragState) return;
			onTimelineStateChangeRef.current(timelineState);
		}, [timelineState, dragState]);

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

		const prevSelectedClipsDataRef = useRef<string | null>(null);
		useEffect(() => {
			if (dragState) return;

			if (selectedClips.length > 0 && onClipSelect) {
				const updatedSelections = selectedClips
					.map((s) => {
						const track = timelineState.tracks.find((t) => t.id === s.trackId);
						const clip = track?.clips.find((c) => c.id === s.clipId);
						return clip ? { clip, trackId: s.trackId } : null;
					})
					.filter((s): s is { clip: Clip; trackId: string } => s !== null);
				if (updatedSelections.length > 0) {
					const newDataKey = updatedSelections
						.map((s) => `${s.clip.id}:${s.trackId}:${s.clip.startTime}:${s.clip.duration}:${s.clip.sourceIn}`)
						.join("|");
					if (newDataKey !== prevSelectedClipsDataRef.current) {
						prevSelectedClipsDataRef.current = newDataKey;
						onClipSelect(updatedSelections);
					}
				}
			}
		}, [timelineState, selectedClips, onClipSelect, dragState]);

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

				if (timestamp - lastStateUpdateRef.current > 33) {
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

		const isSnappingEnabledRef = useRef(isSnappingEnabled);
		isSnappingEnabledRef.current = isSnappingEnabled;
		const snapPointsCacheRef = useRef(snapPointsCache);
		snapPointsCacheRef.current = snapPointsCache;
		const clipSizeMaxRef = useRef(clipSizeMax);
		clipSizeMaxRef.current = clipSizeMax;

		const isPlayingRef = useRef(isPlaying);
		isPlayingRef.current = isPlaying;
		const onTimeChangeRef = useRef(onTimeChange);
		onTimeChangeRef.current = onTimeChange;

		// seek handler with snapping
		const handleSeek = useCallback(
			(time: number) => {
				const snappedTime = calculatePlayheadSnappedTime(time, isSnappingEnabledRef.current, snapPointsCacheRef.current);
				currentTimeRef.current = snappedTime;
				onTimeChangeRef.current(snappedTime);
				if (isPlayingRef.current) {
					playbackStartTimeRef.current = performance.now();
					playbackStartPositionRef.current = snappedTime;
				}
			},
			[currentTimeRef]
		);

		// timeline click handler (deselect)
		const handleTimelineClick = useCallback(() => clearSelection(), [clearSelection]);

		// track mouse move for blade cursor
		const toolModeRef = useRef(toolMode);
		toolModeRef.current = toolMode;
		const pixelsPerSecondRef = useRef(pixelsPerSecond);
		pixelsPerSecondRef.current = pixelsPerSecond;

		const handleTrackMouseMove = useCallback((e: React.MouseEvent, trackId: string) => {
			if (toolModeRef.current !== "blade") {
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
			const pps = pixelsPerSecondRef.current;
			const mouseTime = mouseX / pps;
			const fps = 30;
			const frameTime = 1 / fps;
			const snappedTime = Math.round(mouseTime / frameTime) * frameTime;
			const snappedX = snappedTime * pps;
			const last = lastBladeCursorRef.current;
			if (!last || last.trackId !== trackId || Math.abs(last.x - snappedX) > 1) {
				lastBladeCursorRef.current = { x: snappedX, trackId };
				setBladeCursorPosition({ x: snappedX, trackId });
			}
		}, []);

		// media drag over handler
		const handleMediaDragOver = useCallback(
			(e: React.DragEvent, trackId: string) => {
				e.preventDefault();

				e.dataTransfer.dropEffect = "copy";
				const mediaItem = getCurrentDragItem();
				if (!mediaItem) return;
				const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
				const rect = timelineRef.current?.getBoundingClientRect();
				if (!rect) return;
				const pps = pixelsPerSecondRef.current;
				const dragX = e.clientX - rect.left + scrollLeft;
				let dragTime = Math.max(0, dragX / pps);
				let clipDuration = mediaItem.duration;
				const maxSize = clipSizeMaxRef.current;
				if (maxSize && clipDuration > maxSize) {
					clipDuration = maxSize;
				}
				const timelineDuration = timelineStateRef.current.duration;
				if (dragTime + clipDuration > timelineDuration) {
					clipDuration = timelineDuration - dragTime;
				}
				if (clipDuration <= 0) {
					if (lastDragPreviewRef.current !== null) {
						lastDragPreviewRef.current = null;
						setDragPreview(null);
					}
					return;
				}

				if (isSnappingEnabledRef.current) {
					const snappedTime = calculateSnappedTime(dragTime, "preview", clipDuration, {
						isSnappingEnabled: isSnappingEnabledRef.current,
						snapPoints: snapPointsCacheRef.current,
						currentTimeRef,
					});
					if (snappedTime >= 0 && snappedTime + clipDuration <= timelineDuration) {
						dragTime = snappedTime;
					}
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
			[currentTimeRef]
		);

		const onClipAddedRef = useRef(onClipAdded);
		onClipAddedRef.current = onClipAdded;

		// media drop handler
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
					const pps = pixelsPerSecondRef.current;
					const dropX = e.clientX - rect.left + scrollLeft;
					let dropTime = Math.max(0, dropX / pps);
					let clipDuration = mediaItem.duration;
					const maxSize = clipSizeMaxRef.current;
					if (maxSize && clipDuration > maxSize) {
						clipDuration = maxSize;
					}
					const timelineDuration = timelineStateRef.current.duration;
					if (dropTime + clipDuration > timelineDuration) {
						clipDuration = timelineDuration - dropTime;
					}
					if (clipDuration <= 0) return;

					if (isSnappingEnabledRef.current) {
						const snappedTime = calculateSnappedTime(dropTime, "drop", clipDuration, {
							isSnappingEnabled: isSnappingEnabledRef.current,
							snapPoints: snapPointsCacheRef.current,
							currentTimeRef,
						});
						if (snappedTime >= 0 && snappedTime + clipDuration <= timelineDuration) {
							dropTime = snappedTime;
						}
					}

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

					onClipAddedRef.current?.(trackId, newClip);
				} catch (err) {
					console.error("Error handling media drop:", err);
				}
			},
			[updateTimelineState, currentTimeRef]
		);

		const handleMediaDragLeave = useCallback(() => {
			lastDragPreviewRef.current = null;
			setDragPreview(null);
		}, []);

		const handleTrackMouseEnter = useCallback(
			(trackId: string) => {
				setHoveredTrackId(trackId);
			},
			[setHoveredTrackId]
		);

		const onClipSplitRef = useRef(onClipSplit);
		onClipSplitRef.current = onClipSplit;

		// blade click handler
		const handleBladeClick = useCallback(
			(e: React.MouseEvent, trackId: string) => {
				if (toolModeRef.current !== "blade") return;
				e.stopPropagation();

				const now = Date.now();
				const timeSinceLastCut = now - lastBladeTimeRef.current;
				if (timeSinceLastCut < BLADE_COOLDOWN_MS) {
					return;
				}
				lastBladeTimeRef.current = now;

				const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
				const rect = timelineRef.current?.getBoundingClientRect();
				if (!rect) return;
				const pps = pixelsPerSecondRef.current;
				const clickX = e.clientX - rect.left + scrollLeft;
				const mouseTime = clickX / pps;
				const fps = 30;
				const frameTime = 1 / fps;
				const clickTime = Math.round(mouseTime / frameTime) * frameTime;

				const splitTimestamp = Date.now();

				const currentState = timelineStateRef.current;
				const trackIndex = currentState.tracks.findIndex((t) => t.id === trackId);
				if (trackIndex === -1) return;
				const track = currentState.tracks[trackIndex];
				const clipIndex = track.clips.findIndex((c) => clickTime >= c.startTime && clickTime < c.startTime + c.duration);
				if (clipIndex === -1) return;
				const clipToSplit = track.clips[clipIndex];
				if (clickTime <= clipToSplit.startTime || clickTime >= clipToSplit.startTime + clipToSplit.duration - frameTime) return;

				const leftPart: Clip = { ...clipToSplit, duration: clickTime - clipToSplit.startTime };
				const timelineOffset = clickTime - clipToSplit.startTime;
				const speed = clipToSplit.type === "video" ? (clipToSplit as VideoClip).properties.speed : 1;
				const sourceOffset = timelineOffset * speed;
				const rightPart: Clip = {
					...clipToSplit,
					id: `${clipToSplit.id}-split-${splitTimestamp}`,
					startTime: clickTime,
					duration: clipToSplit.startTime + clipToSplit.duration - clickTime,
					sourceIn: clipToSplit.sourceIn + sourceOffset,
				};

				updateTimelineState((prev) => {
					const newState = { ...prev, tracks: prev.tracks.map((t) => ({ ...t, clips: [...t.clips] })) };
					const tIdx = newState.tracks.findIndex((t) => t.id === trackId);
					if (tIdx === -1) return prev;
					const cIdx = newState.tracks[tIdx].clips.findIndex((c) => c.id === clipToSplit.id);
					if (cIdx === -1) return prev;

					newState.tracks[tIdx].clips[cIdx] = leftPart;
					newState.tracks[tIdx].clips.push(rightPart);
					return newState;
				});

				onClipSplitRef.current?.(trackId, leftPart, rightPart);
			},
			[updateTimelineState]
		);

		const timelineWidth = timelineState.duration * pixelsPerSecond;

		return (
			<div className="h-full bg-background border-t border-border flex flex-col" data-tutorial="timeline">
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
					<div className="w-32 shrink-0 bg-card border-r border-border flex flex-col relative z-30">
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
								{displayTracks.map((track, index) => (
									<div
										key={track.id}
										data-tutorial={track.type === "video" ? "video-track" : "audio-track"}
										className={`h-10 flex items-center px-3 bg-card ${index !== displayTracks.length - 1 ? "border-b border-border" : ""}`}
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
						onWheel={(e) => {
							if (e.ctrlKey || e.metaKey) {
								e.preventDefault();
								if (scrollContainerRef.current) {
									scrollContainerRef.current.scrollLeft += e.deltaY;
								}
							}
						}}
					>
						<div className="min-w-full inline-block" style={{ width: `${timelineWidth + 200}px` }}>
							<div ref={timelineRef} className="sticky top-0 z-20 bg-card">
								<TimeRuler duration={timelineState.duration} pixelsPerSecond={pixelsPerSecond} onSeek={handleSeek} />
							</div>

							<div className="relative">
								{displayTracks.map((track, index) => (
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
											timelineDuration={timelineState.duration}
											selectedClips={selectedClips}
											draggedClipId={dragState?.clipId || null}
											isHovered={hoveredTrackId === track.id}
											onClipSelect={handleClipSelect}
											onClipDragStart={handleClipDragStart}
											onTrackClick={handleTimelineClick}
											onTrackMouseEnter={handleTrackMouseEnter}
											toolMode={toolMode}
											onBladeClick={handleBladeClick}
											isLastTrack={index === displayTracks.length - 1}
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
							zIndex: 20,
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

export default memo(Timeline);
