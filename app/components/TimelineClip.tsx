import { memo } from "react";
import { Clip, VideoClip } from "../types/timeline";
import { useVideoThumbnails } from "../hooks/useVideoThumbnails";
import { Snowflake } from "lucide-react";

interface TimelineClipProps {
	clip: Clip;
	trackId: string;
	pixelsPerSecond: number;
	isSelected: boolean;
	isDragging: boolean;
	onSelect: (clipId: string, trackId: string, event: { ctrlKey: boolean; shiftKey: boolean }) => void;
	onDragStart: (e: React.MouseEvent, clipId: string, trackId: string, type: "move" | "trim-start" | "trim-end") => void;
	toolMode: "select" | "blade";
	onBladeClick: (e: React.MouseEvent, trackId: string) => void;
	bladeCursorPosition: number | null;
}

function TimelineClip({
	clip,
	trackId,
	pixelsPerSecond,
	isSelected,
	isDragging,
	onSelect,
	onDragStart,
	toolMode,
	onBladeClick,
	bladeCursorPosition,
}: TimelineClipProps) {
	const left = clip.startTime * pixelsPerSecond;
	const width = clip.duration * pixelsPerSecond;
	const clipEnd = left + width;

	const thumbnailCount = clip.type === "video" ? Math.max(5, Math.ceil(clip.duration / 2)) : 0;
	const thumbnails = useVideoThumbnails(clip.type === "video" ? clip.src : "", clip.duration, thumbnailCount);

	// calculate if cursor is over this clip and where
	const fps = 30;
	const frameTime = 1 / fps;
	const frameWidth = frameTime * pixelsPerSecond;

	const isCursorOverClip =
		bladeCursorPosition !== null &&
		bladeCursorPosition > left && // don't show at exact start
		bladeCursorPosition < clipEnd - frameWidth && // don't show at last frame
		toolMode === "blade";

	const cutLinePosition = isCursorOverClip ? bladeCursorPosition - left : null;

	const handleMouseDown = (e: React.MouseEvent) => {
		if (toolMode === "blade") {
			e.stopPropagation();
			onBladeClick(e, trackId);
			return;
		}

		e.stopPropagation();

		onSelect(clip.id, trackId, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });

		if (e.ctrlKey || e.shiftKey) {
			return;
		}

		const rect = e.currentTarget.getBoundingClientRect();
		const clickX = e.clientX - rect.left;

		let dragType: "move" | "trim-start" | "trim-end" = "move";
		if (clickX < 10) {
			dragType = "trim-start";
		} else if (clickX > width - 10) {
			dragType = "trim-end";
		}

		onDragStart(e, clip.id, trackId, dragType);
	};

	const thumbnailWidth = 80;
	const thumbnailHeight = 45;
	const repeatCount = thumbnails.length > 0 ? Math.ceil(width / thumbnailWidth) : 0;

	return (
		<div
			className={`absolute h-full select-none border-2 rounded overflow-hidden ${
				clip.type === "video" ? "bg-purple-600" : "bg-green-600"
			} ${isSelected ? "border-red-500" : "border-zinc-800"}`}
			style={{
				left: `${left}px`,
				width: `${width}px`,
				top: "0",
				zIndex: isSelected ? 50 : 10,
				cursor: toolMode === "blade" ? "inherit" : "move",
			}}
			onMouseDown={handleMouseDown}
			onClick={(e) => {
				if (toolMode === "blade") {
					e.stopPropagation();
					onBladeClick(e, trackId);
				} else {
					e.stopPropagation();
				}
			}}
		>
			{clip.type === "video" && thumbnails.length > 0 && (
				<div className="absolute inset-0 flex pointer-events-none">
					{Array.from({ length: repeatCount }).map((_, i) => {
						const thumbnailIndex = i % thumbnails.length;
						return (
							<img
								key={i}
								src={thumbnails[thumbnailIndex]}
								alt=""
								className="h-full object-cover flex-shrink-0"
								style={{
									width: `${thumbnailWidth}px`,
									height: "100%",
									objectFit: "cover",
								}}
							/>
						);
					})}
				</div>
			)}

			<div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

			<div className="relative h-full flex items-end px-2 pb-1 overflow-hidden">
				<span className="text-xs text-white truncate drop-shadow-md">{clip.src.split("/").pop()}</span>
			</div>

			{clip.type === "video" && (clip as VideoClip).properties.freezeFrame && (
				<div className="absolute top-1 right-1 pointer-events-none">
					<Snowflake className="w-4 h-4 text-cyan-400 drop-shadow-md" />
				</div>
			)}

			{toolMode === "select" && (
				<>
					<div
						className="absolute left-0 top-0 w-2 h-full cursor-ew-resize"
						onMouseDown={(e) => {
							e.stopPropagation();
							onSelect(clip.id, trackId, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
							onDragStart(e, clip.id, trackId, "trim-start");
						}}
						onClick={(e) => e.stopPropagation()}
					/>
					<div
						className="absolute right-0 top-0 w-2 h-full cursor-ew-resize"
						onMouseDown={(e) => {
							e.stopPropagation();
							onSelect(clip.id, trackId, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
							onDragStart(e, clip.id, trackId, "trim-end");
						}}
						onClick={(e) => e.stopPropagation()}
					/>
				</>
			)}

			{cutLinePosition !== null && (
				<div
					className="absolute top-0 h-full w-[2px] bg-red-500 pointer-events-none z-50"
					style={{
						left: `${cutLinePosition}px`,
						boxShadow: "0 0 4px rgba(239, 68, 68, 0.8)",
					}}
				/>
			)}
		</div>
	);
}

export default memo(TimelineClip);
