"use client";

import { useState, useRef, memo, useCallback } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import MediaBrowser from "./MediaBrowser";
import EffectsBrowser from "./EffectsBrowser";
import VideoPreview from "./VideoPreview";
import Inspector from "./Inspector";
import Timeline, { TimelineRef } from "./Timeline";
import { Clip, TimelineState, VideoClip, AudioClip } from "../types/timeline";

interface MainLayoutProps {
	showMedia: boolean;
	showEffects: boolean;
}

// components that don't need playback state
const MemoizedMediaBrowser = memo(MediaBrowser);
const MemoizedEffectsBrowser = memo(EffectsBrowser);

export default function MainLayout({ showMedia, showEffects }: MainLayoutProps) {
	const bothVisible = showMedia && showEffects;
	const noneVisible = !showMedia && !showEffects;
	const [selectedClips, setSelectedClips] = useState<{ clip: Clip; trackId: string }[] | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [timelineState, setTimelineState] = useState<TimelineState | null>(null);

	const currentTimeRef = useRef(0);
	const timelineRef = useRef<TimelineRef>(null);

	const handleClipUpdate = useCallback((trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<AudioClip>) => {
		timelineRef.current?.updateClip(trackId, clipId, updates);
	}, []);

	return (
		<div className="h-screen pt-8 bg-[#0a0a0a]">
			<ResizablePanelGroup direction="horizontal" className="h-full">
				{!noneVisible && (
					<>
						<ResizablePanel defaultSize={40} minSize={20} maxSize={60}>
							{bothVisible ? (
								<ResizablePanelGroup direction="vertical">
									<ResizablePanel defaultSize={50} minSize={20}>
										<MemoizedMediaBrowser />
									</ResizablePanel>
									<ResizableHandle />
									<ResizablePanel defaultSize={50} minSize={20}>
										<MemoizedEffectsBrowser />
									</ResizablePanel>
								</ResizablePanelGroup>
							) : showMedia ? (
								<MemoizedMediaBrowser />
							) : (
								<MemoizedEffectsBrowser />
							)}
						</ResizablePanel>
						<ResizableHandle />
					</>
				)}

				<ResizablePanel defaultSize={noneVisible ? 100 : 60} minSize={40}>
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
								onTimelineStateChange={setTimelineState}
							/>
						</ResizablePanel>
					</ResizablePanelGroup>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
