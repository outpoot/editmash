import { memo } from "react";
import { Track, Clip } from "../types/timeline";
import TimelineClip from "./TimelineClip";

interface TimelineTrackProps {
	track: Track;
	pixelsPerSecond: number;
	selectedClips: Array<{ clipId: string; trackId: string }>;
	draggedClipId: string | null;
	isHovered: boolean;
	onClipSelect: (clipId: string, trackId: string, event?: { ctrlKey: boolean; shiftKey: boolean }) => void;
	onClipDragStart: (e: React.MouseEvent, clipId: string, trackId: string, type: "move" | "trim-start" | "trim-end") => void;
	onTrackClick: () => void;
	onTrackMouseEnter: () => void;
	toolMode: "select" | "blade";
	onBladeClick: (e: React.MouseEvent, trackId: string) => void;
	onTrackMouseMove: (e: React.MouseEvent, trackId: string) => void;
	bladeCursorPosition: number | null;
	onMediaDrop: (e: React.DragEvent, trackId: string) => void;
	onMediaDragOver: (e: React.DragEvent, trackId: string) => void;
	onMediaDragLeave: () => void;
	dragPreview: { trackId: string; startTime: number; duration: number; type: "video" | "audio" } | null;
	isLastTrack?: boolean;
}

function TimelineTrack({
	track,
	pixelsPerSecond,
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
}: TimelineTrackProps) {
	const handleDragOver = (e: React.DragEvent) => {
		onMediaDragOver(e, track.id);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		onMediaDrop(e, track.id);
	};
	return (
		<div
			className={`h-10 relative cursor-crosshair transition-colors ${!isLastTrack ? "border-b border-border" : ""} ${
				isHovered && draggedClipId ? "bg-accent" : "bg-background"
			}`}
			onClick={(e) => {
				if (toolMode === "blade") {
					onBladeClick(e, track.id);
				} else {
					onTrackClick();
				}
			}}
			onMouseEnter={onTrackMouseEnter}
			onMouseMove={(e) => onTrackMouseMove(e, track.id)}
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
				/>
			))}
		</div>
	);
}

export default memo(TimelineTrack);
