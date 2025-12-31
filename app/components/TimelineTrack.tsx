import { memo, useMemo, useCallback } from "react";
import { Track, Clip } from "../types/timeline";
import TimelineClip, { type ClipChangeNotification } from "./TimelineClip";
import type { RemoteSelection } from "./MatchWS";

interface TimelineTrackProps {
	track: Track;
	pixelsPerSecond: number;
	timelineDuration: number;
	selectedClips: Array<{ clipId: string; trackId: string }>;
	draggedClipId: string | null;
	isHovered: boolean;
	onClipSelect: (clipId: string, trackId: string, event?: { ctrlKey: boolean; shiftKey: boolean }) => void;
	onClipDragStart: (e: React.MouseEvent, clipId: string, trackId: string, type: "move" | "trim-start" | "trim-end") => void;
	onTrackClick: () => void;
	onTrackMouseEnter: (trackId: string) => void;
	toolMode: "select" | "blade";
	onBladeClick: (e: React.MouseEvent, trackId: string) => void;
	onTrackMouseMove: (e: React.MouseEvent, trackId: string) => void;
	bladeCursorPosition: number | null;
	onMediaDrop: (e: React.DragEvent, trackId: string) => void;
	onMediaDragOver: (e: React.DragEvent, trackId: string) => void;
	onMediaDragLeave: () => void;
	dragPreview: { trackId: string; startTime: number; duration: number; type: "video" | "audio" } | null;
	isLastTrack?: boolean;
	remoteSelections?: Map<string, RemoteSelection>;
	clipChangeNotifications?: Map<string, ClipChangeNotification[]>;
}

function clipsEqual(a: Clip[], b: Clip[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const clipA = a[i];
		const clipB = b[i];
		if (
			clipA.id !== clipB.id ||
			clipA.startTime !== clipB.startTime ||
			clipA.duration !== clipB.duration ||
			clipA.sourceIn !== clipB.sourceIn ||
			clipA.thumbnail !== clipB.thumbnail
		) {
			return false;
		}
	}
	return true;
}

function arePropsEqual(prev: TimelineTrackProps, next: TimelineTrackProps): boolean {
	if (
		prev.pixelsPerSecond !== next.pixelsPerSecond ||
		prev.timelineDuration !== next.timelineDuration ||
		prev.draggedClipId !== next.draggedClipId ||
		prev.isHovered !== next.isHovered ||
		prev.toolMode !== next.toolMode ||
		prev.bladeCursorPosition !== next.bladeCursorPosition ||
		prev.isLastTrack !== next.isLastTrack
	) {
		return false;
	}

	if (prev.track !== next.track) {
		if (prev.track.id !== next.track.id || prev.track.type !== next.track.type) {
			return false;
		}
		if (!clipsEqual(prev.track.clips, next.track.clips)) {
			return false;
		}
	}

	if (prev.selectedClips !== next.selectedClips) {
		if (prev.selectedClips.length !== next.selectedClips.length) {
			return false;
		}
		for (let i = 0; i < prev.selectedClips.length; i++) {
			if (
				prev.selectedClips[i].clipId !== next.selectedClips[i].clipId ||
				prev.selectedClips[i].trackId !== next.selectedClips[i].trackId
			) {
				return false;
			}
		}
	}

	if (prev.dragPreview !== next.dragPreview) {
		if (!prev.dragPreview || !next.dragPreview) {
			return false;
		}
		if (
			prev.dragPreview.trackId !== next.dragPreview.trackId ||
			prev.dragPreview.startTime !== next.dragPreview.startTime ||
			prev.dragPreview.duration !== next.dragPreview.duration ||
			prev.dragPreview.type !== next.dragPreview.type
		) {
			return false;
		}
	}
	
	return true;
}

function TimelineTrack({
	track,
	pixelsPerSecond,
	timelineDuration,
	selectedClips,
	draggedClipId,
	isHovered,
	onClipSelect,
	onClipDragStart,
	onTrackClick,
	onTrackMouseEnter,
	toolMode,
	onBladeClick,
	onTrackMouseMove,
	bladeCursorPosition,
	onMediaDrop,
	onMediaDragOver,
	onMediaDragLeave,
	dragPreview,
	isLastTrack,
	remoteSelections,
	clipChangeNotifications,
}: TimelineTrackProps) {
	const handleDragOver = useCallback((e: React.DragEvent) => {
		onMediaDragOver(e, track.id);
	}, [onMediaDragOver, track.id]);

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		onMediaDrop(e, track.id);
	}, [onMediaDrop, track.id]);

	const handleMouseEnter = useCallback(() => {
		onTrackMouseEnter(track.id);
	}, [onTrackMouseEnter, track.id]);

	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		onTrackMouseMove(e, track.id);
	}, [onTrackMouseMove, track.id]);

	const handleClick = useCallback((e: React.MouseEvent) => {
		if (toolMode === "blade") {
			onBladeClick(e, track.id);
		} else {
			onTrackClick();
		}
	}, [toolMode, onBladeClick, track.id, onTrackClick]);

	const clipRemoteSelectors = useMemo(() => {
		const result = new Map<string, Array<{ userId: string; username: string; userImage?: string; highlightColor: string }>>();
		if (!remoteSelections) return result;

		for (const selection of remoteSelections.values()) {
			for (const sel of selection.selectedClips) {
				if (sel.trackId === track.id) {
					const existing = result.get(sel.clipId) || [];
					existing.push({
						userId: selection.userId,
						username: selection.username,
						userImage: selection.userImage,
						highlightColor: selection.highlightColor,
					});
					result.set(sel.clipId, existing);
				}
			}
		}
		return result;
	}, [remoteSelections, track.id]);

	return (
		<div
			className={`h-10 relative cursor-crosshair transition-colors ${!isLastTrack ? "border-b border-border" : ""} ${
				isHovered && draggedClipId ? "bg-accent" : "bg-background"
			}`}
			onClick={handleClick}
			onMouseEnter={handleMouseEnter}
			onMouseMove={handleMouseMove}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
			onDragLeave={onMediaDragLeave}
		>
			{dragPreview && dragPreview.trackId === track.id && (
				<div
					className={`absolute h-full select-none border-2 rounded overflow-hidden opacity-40 border-border ${
						dragPreview.type === "video" ? "bg-purple-600" : "bg-green-600"
					}`}
					style={{
						left: `${dragPreview.startTime * pixelsPerSecond}px`,
						width: `${dragPreview.duration * pixelsPerSecond}px`,
						top: "0",
						pointerEvents: "none",
						zIndex: 100,
					}}
				>
					<div className="h-full flex items-center justify-center">
						<span className="text-xs text-white opacity-70">Drop here</span>
					</div>
				</div>
			)}

			{track.clips.map((clip) => (
				<TimelineClip
					key={clip.id}
					clip={clip}
					trackId={track.id}
					pixelsPerSecond={pixelsPerSecond}
					isSelected={selectedClips.some((c) => c.clipId === clip.id && c.trackId === track.id)}
					onSelect={onClipSelect}
					onDragStart={onClipDragStart}
					toolMode={toolMode}
					onBladeClick={onBladeClick}
					bladeCursorPosition={bladeCursorPosition}
					remoteSelectors={clipRemoteSelectors.get(clip.id)}
					changeNotifications={clipChangeNotifications?.get(clip.id)}
				/>
			))}
			
			<div
				className="absolute bg-card pointer-events-none border-l border-border"
				style={{
					left: `${timelineDuration * pixelsPerSecond}px`,
					right: 0,
					top: 0,
					bottom: '-1px',
				}}
			/>
		</div>
	);
}

export default memo(TimelineTrack, arePropsEqual);
