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
}

export default function TimelineTrack({
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
}: TimelineTrackProps) {
	return (
		<div className="flex border-b border-zinc-800">
			{/* Track label */}
			<div className="w-32 flex-shrink-0 bg-[#1e1e1e] border-r border-zinc-800 flex items-center px-3">
				<div className="flex items-center gap-2">
					<div className={`w-2 h-2 rounded-full ${track.type === "video" ? "bg-purple-500" : "bg-green-500"}`} />
					<span className="text-sm text-zinc-300 font-medium">
						{track.type === "video" ? "Video" : "Audio"} {track.id.split("-")[1]}
					</span>
				</div>
			</div>

			{/* Track content area */}
			<div
				className={`flex-1 h-[2.5rem] relative cursor-crosshair transition-colors ${
					isHovered && draggedClipId ? "bg-[#252525]" : "bg-[#1a1a1a]"
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
			>
				{track.clips.map((clip) => (
					<TimelineClip
						key={clip.id}
						clip={clip}
						trackId={track.id}
						pixelsPerSecond={pixelsPerSecond}
						isSelected={selectedClips.some((c) => c.clipId === clip.id && c.trackId === track.id)}
						isDragging={draggedClipId === clip.id}
						onSelect={(e) => onClipSelect(clip.id, track.id, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })}
						onDragStart={(e, type) => onClipDragStart(e, clip.id, track.id, type)}
						toolMode={toolMode}
						onBladeClick={onBladeClick}
						bladeCursorPosition={bladeCursorPosition}
					/>
				))}
			</div>
		</div>
	);
}
