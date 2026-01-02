"use client";

import { useState, useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { HugeiconsIcon } from "@hugeicons/react";
import { Upload04Icon } from "@hugeicons/core-free-icons";
import VideoPreview from "./VideoPreview";
import Inspector from "./Inspector";
import Timeline, { TimelineRef } from "./Timeline";
import MediaCardDock from "./MediaCardDock";
import { Clip, TimelineState, VideoClip, ImageClip, AudioClip } from "../types/timeline";
import type { RemoteSelection } from "./MatchWS";
import { useDebouncedCallback } from "@/lib/utils";

interface MainLayoutProps {
	onTimelineStateChange?: (timelineState: TimelineState | null) => void;
	maxClipsPerUser?: number;
	onClipAdded?: (trackId: string, clip: Clip) => void;
	onClipUpdated?: (trackId: string, clip: Clip) => void;
	onClipRemoved?: (trackId: string, clipId: string) => void;
	onClipSplit?: (trackId: string, originalClip: Clip, newClip: Clip) => void;
	onSelectionChange?: (selectedClips: Array<{ clipId: string; trackId: string }>) => void;
	remoteSelections?: Map<string, RemoteSelection>;
	onCurrentTimeChange?: (time: number) => void;
	clipSizeMax?: number;
}

export interface MainLayoutRef {
	loadTimeline: (state: TimelineState) => void;
	addRemoteClip: (trackId: string, clip: Clip) => void;
	removeRemoteClip: (trackId: string, clipId: string) => void;
	updateRemoteClip: (trackId: string, clipId: string, updates: Partial<Clip>) => void;
	moveRemoteClip: (oldTrackId: string, newTrackId: string, clipId: string, updates: Partial<Clip>) => void;
	splitRemoteClip: (trackId: string, originalClip: Clip, newClip: Clip) => void;
	syncZoneClips: (clips: Array<{ trackId: string; clip: Clip }>) => void;
	getTimelineState: () => TimelineState | null;
}

const MainLayout = forwardRef<MainLayoutRef, MainLayoutProps>(
	(
		{
			onTimelineStateChange,
			maxClipsPerUser = 10,
			onClipAdded,
			onClipUpdated,
			onClipRemoved,
			onClipSplit,
			onSelectionChange,
			remoteSelections,
			onCurrentTimeChange,
			clipSizeMax,
		},
		ref
	) => {
		const [selectedClips, setSelectedClips] = useState<{ clip: Clip; trackId: string }[] | null>(null);
		const [isPlaying, setIsPlaying] = useState(false);
		const [currentTime, setCurrentTime] = useState(0);
		const [timelineState, setTimelineState] = useState<TimelineState | null>(null);
		const [transformMode, setTransformMode] = useState<"transform" | "crop" | null>(null);
		const [isDragOver, setIsDragOver] = useState(false);

		const dragCounterRef = useRef(0);
		const mediaCardDockRef = useRef<{ handleExternalDrop: (files: FileList) => void }>(null);
		const currentTimeRef = useRef(0);
		const timelineRef = useRef<TimelineRef>(null);
		const isPlayingRef = useRef(false);
		const pendingZoneClipsRef = useRef<Array<{ trackId: string; clip: Clip }> | null>(null);
		const onSelectionChangeRef = useRef(onSelectionChange);
		const onCurrentTimeChangeRef = useRef(onCurrentTimeChange);
		onSelectionChangeRef.current = onSelectionChange;
		onCurrentTimeChangeRef.current = onCurrentTimeChange;
		
		isPlayingRef.current = isPlaying;
		
		useEffect(() => {
			if (!isPlaying && pendingZoneClipsRef.current) {
				const clips = pendingZoneClipsRef.current;
				pendingZoneClipsRef.current = null;
				timelineRef.current?.syncZoneClips(clips);
			}
		}, [isPlaying]);

		const broadcastSelection = useDebouncedCallback(
			(clips: Array<{ clipId: string; trackId: string }>) => onSelectionChangeRef.current?.(clips),
			50
		);

		const onClipAddedRef = useRef(onClipAdded);
		onClipAddedRef.current = onClipAdded;
		const onClipUpdatedRef = useRef(onClipUpdated);
		onClipUpdatedRef.current = onClipUpdated;
		const onClipRemovedRef = useRef(onClipRemoved);
		onClipRemovedRef.current = onClipRemoved;
		const onClipSplitRef = useRef(onClipSplit);
		onClipSplitRef.current = onClipSplit;
		const broadcastClipUpdate = useDebouncedCallback(
			(trackId: string, clip: Clip) => onClipUpdatedRef.current?.(trackId, clip),
			150 // ms
		);

		const handleTimeChange = useCallback((time: number) => {
			setCurrentTime(time);
			onCurrentTimeChangeRef.current?.(time);
		}, []);

		const handleClipSelect = useCallback(
			(selection: { clip: Clip; trackId: string }[] | null) => {
				setSelectedClips(selection);
				const clips = selection?.map((s) => ({ clipId: s.clip.id, trackId: s.trackId })) ?? [];
				broadcastSelection(clips);
			},
			[broadcastSelection]
		);

		const handleClipUpdate = useCallback(
			(trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<ImageClip> | Partial<AudioClip>) => {
				timelineRef.current?.updateClip(trackId, clipId, updates);
				const state = timelineRef.current?.getState();
				const track = state?.tracks.find((t) => t.id === trackId);
				const currentClip = track?.clips.find((c) => c.id === clipId);
				if (currentClip) {
					const updatedClip = { ...currentClip, ...updates } as Clip;
					broadcastClipUpdate(trackId, updatedClip);

					setSelectedClips((prev) => {
						if (!prev) return null;
						return prev.map((s) => {
							if (s.clip.id === clipId && s.trackId === trackId) {
								return { ...s, clip: updatedClip };
							}
							return s;
						});
					});
				}
			},
			[broadcastClipUpdate]
		);

		const onTimelineStateChangeRef = useRef(onTimelineStateChange);
		onTimelineStateChangeRef.current = onTimelineStateChange;

		const handleTimelineStateChange = useCallback(
			(state: TimelineState) => {
				setTimelineState(state);
				onTimelineStateChangeRef.current?.(state);
			},
			[]
		);

		const handleClipAdded = useCallback((trackId: string, clip: Clip) => {
			onClipAddedRef.current?.(trackId, clip);
		}, []);

		const handleClipUpdated = useCallback((trackId: string, clip: Clip) => {
			onClipUpdatedRef.current?.(trackId, clip);
		}, []);

		const handleClipRemoved = useCallback((trackId: string, clipId: string) => {
			onClipRemovedRef.current?.(trackId, clipId);
		}, []);

		const handleClipSplit = useCallback((trackId: string, originalClip: Clip, newClip: Clip) => {
			onClipSplitRef.current?.(trackId, originalClip, newClip);
		}, []);

		const handleGlobalDragEnter = useCallback((e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			dragCounterRef.current = Math.max(0, dragCounterRef.current + 1);

			if (e.dataTransfer.types.includes("Files")) {
				setIsDragOver(true);
			}
		}, []);

		const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);

			if (dragCounterRef.current === 0) {
				setIsDragOver(false);
			}
		}, []);

		const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (e.dataTransfer.types.includes("Files")) {
				e.dataTransfer.dropEffect = "copy";
			}
		}, []);

		const handleGlobalDrop = useCallback((e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);
			dragCounterRef.current = 0;

			const files = e.dataTransfer.files;
			if (files && files.length > 0 && mediaCardDockRef.current) {
				mediaCardDockRef.current.handleExternalDrop(files);
			}
		}, []);

		useImperativeHandle(
			ref,
			() => ({
				loadTimeline: (state: TimelineState) => {
					timelineRef.current?.loadTimeline(state);
					setTimelineState(state);
					onTimelineStateChange?.(state);
				},
				addRemoteClip: (trackId: string, clip: Clip) => {
					timelineRef.current?.addRemoteClip(trackId, clip);
				},
				removeRemoteClip: (trackId: string, clipId: string) => {
					timelineRef.current?.removeRemoteClip(trackId, clipId);
				},
				updateRemoteClip: (trackId: string, clipId: string, updates: Partial<Clip>) => {
					timelineRef.current?.updateRemoteClip(trackId, clipId, updates);
				},
				moveRemoteClip: (oldTrackId: string, newTrackId: string, clipId: string, updates: Partial<Clip>) => {
					timelineRef.current?.moveRemoteClip(oldTrackId, newTrackId, clipId, updates);
				},
				splitRemoteClip: (trackId: string, originalClip: Clip, newClip: Clip) => {
					timelineRef.current?.splitRemoteClip(trackId, originalClip, newClip);
				},
				syncZoneClips: (clips: Array<{ trackId: string; clip: Clip }>) => {
					if (isPlayingRef.current) {
						pendingZoneClipsRef.current = clips;
						return;
					}
					timelineRef.current?.syncZoneClips(clips);
				},
				getTimelineState: () => {
					return timelineRef.current?.getState() ?? timelineState;
				},
			}),
			[onTimelineStateChange, timelineState]
		);

		return (
			<div
				className="flex-1 h-full pt-8 bg-background relative"
				onDragEnter={handleGlobalDragEnter}
				onDragLeave={handleGlobalDragLeave}
				onDragOver={handleGlobalDragOver}
				onDrop={handleGlobalDrop}
			>
				{isDragOver && (
					<div className="fixed inset-0 z-90 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
						<div className="bg-foreground/90 px-8 py-6 rounded-2xl flex flex-col items-center gap-3 border-2 border-primary/50 animate-pulse">
							<HugeiconsIcon icon={Upload04Icon} size={48} strokeWidth={2} className="text-primary" />
							<span className="text-xl font-semibold text-primary-foreground">Drop files to upload</span>
						</div>
					</div>
				)}
				<ResizablePanelGroup direction="horizontal" className="h-full">
					<ResizablePanel defaultSize={100} minSize={40}>
						<ResizablePanelGroup direction="vertical">
							<ResizablePanel defaultSize={60} minSize={30}>
								<ResizablePanelGroup direction="horizontal">
									<ResizablePanel defaultSize={70} minSize={40}>
										<VideoPreview
											timelineState={timelineState}
											currentTime={currentTime}
											currentTimeRef={currentTimeRef}
											isPlaying={isPlaying}
											onPlayPause={() => setIsPlaying(!isPlaying)}
											transformMode={transformMode}
											selectedClips={selectedClips}
											onClipUpdate={handleClipUpdate}
											onClipSelect={handleClipSelect}
										/>
									</ResizablePanel>

									<ResizableHandle />

									<ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
										<Inspector selectedClips={selectedClips} onClipUpdate={handleClipUpdate} currentTime={currentTime} />
									</ResizablePanel>
								</ResizablePanelGroup>
							</ResizablePanel>

							<ResizableHandle />

							<ResizablePanel defaultSize={40} minSize={20}>
								<Timeline
									ref={timelineRef}
									onClipSelect={handleClipSelect}
									currentTime={currentTime}
									currentTimeRef={currentTimeRef}
									onTimeChange={handleTimeChange}
									isPlaying={isPlaying}
									onPlayingChange={setIsPlaying}
									onTimelineStateChange={handleTimelineStateChange}
									onTransformModeChange={setTransformMode}
									onClipAdded={handleClipAdded}
									onClipUpdated={handleClipUpdated}
									onClipRemoved={handleClipRemoved}
									onClipSplit={handleClipSplit}
									remoteSelections={remoteSelections}
									clipSizeMax={clipSizeMax}
								/>
							</ResizablePanel>
						</ResizablePanelGroup>
					</ResizablePanel>
				</ResizablePanelGroup>

				<MediaCardDock ref={mediaCardDockRef} maxClips={maxClipsPerUser} />
			</div>
		);
	}
);

MainLayout.displayName = "MainLayout";

export default MainLayout;
