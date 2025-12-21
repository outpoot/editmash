"use client";

import { useState, useRef, memo, useCallback, useImperativeHandle, forwardRef } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import EffectsBrowser from "./EffectsBrowser";
import VideoPreview from "./VideoPreview";
import Inspector from "./Inspector";
import Timeline, { TimelineRef } from "./Timeline";
import MediaCardDock from "./MediaCardDock";
import { Clip, TimelineState, VideoClip, ImageClip, AudioClip } from "../types/timeline";

interface MainLayoutProps {
	showEffects: boolean;
	onTimelineStateChange?: (timelineState: TimelineState | null) => void;
	maxClipsPerUser?: number;
}

export interface MainLayoutRef {
	loadTimeline: (state: TimelineState) => void;
}

// components that don't need playback state
const MemoizedEffectsBrowser = memo(EffectsBrowser);

const MainLayout = forwardRef<MainLayoutRef, MainLayoutProps>(({ showEffects, onTimelineStateChange, maxClipsPerUser = 10 }, ref) => {
	const [selectedClips, setSelectedClips] = useState<{ clip: Clip; trackId: string }[] | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [timelineState, setTimelineState] = useState<TimelineState | null>(null);
	const [transformMode, setTransformMode] = useState<"transform" | "crop" | null>(null);

	const currentTimeRef = useRef(0);
	const timelineRef = useRef<TimelineRef>(null);

	const handleClipUpdate = useCallback(
		(trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<ImageClip> | Partial<AudioClip>) => {
			timelineRef.current?.updateClip(trackId, clipId, updates);
		},
		[]
	);

	const handleTimelineStateChange = useCallback(
		(state: TimelineState) => {
			setTimelineState(state);
			onTimelineStateChange?.(state);
		},
		[onTimelineStateChange]
	);

	useImperativeHandle(
		ref,
		() => ({
			loadTimeline: (state: TimelineState) => {
				timelineRef.current?.loadTimeline(state);
				setTimelineState(state);
				onTimelineStateChange?.(state);
			},
		}),
		[onTimelineStateChange]
	);

	return (
		<div className="flex-1 h-full pt-8 bg-background relative">
			<ResizablePanelGroup direction="horizontal" className="h-full">
				{showEffects && (
					<>
						<ResizablePanel defaultSize={25} minSize={20} maxSize={60}>
							<MemoizedEffectsBrowser />
						</ResizablePanel>
						<ResizableHandle />
					</>
				)}

				<ResizablePanel defaultSize={showEffects ? 75 : 100} minSize={40}>
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
								onClipSelect={setSelectedClips}
								currentTime={currentTime}
								currentTimeRef={currentTimeRef}
								onTimeChange={setCurrentTime}
								isPlaying={isPlaying}
								onPlayingChange={setIsPlaying}
								onTimelineStateChange={handleTimelineStateChange}
								onTransformModeChange={setTransformMode}
							/>
						</ResizablePanel>
					</ResizablePanelGroup>
				</ResizablePanel>
			</ResizablePanelGroup>

			<MediaCardDock maxClips={maxClipsPerUser} />
		</div>
	);
});

MainLayout.displayName = "MainLayout";

export default MainLayout;
