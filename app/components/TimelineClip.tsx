import { Clip } from "../types/timeline";

interface TimelineClipProps {
	clip: Clip;
	trackId: string;
	pixelsPerSecond: number;
	isSelected: boolean;
	isDragging: boolean;
	onSelect: (e: React.MouseEvent) => void;
	onDragStart: (e: React.MouseEvent, type: "move" | "trim-start" | "trim-end") => void;
	toolMode: "select" | "blade";
	onBladeClick: (e: React.MouseEvent, trackId: string) => void;
	bladeCursorPosition: number | null;
}

export default function TimelineClip({ clip, trackId, pixelsPerSecond, isSelected, isDragging, onSelect, onDragStart, toolMode, onBladeClick, bladeCursorPosition }: TimelineClipProps) {
	const left = clip.startTime * pixelsPerSecond;
	const width = clip.duration * pixelsPerSecond;
	const clipEnd = left + width;

	// calculate if cursor is over this clip and where
	const fps = 30;
	const frameTime = 1 / fps;
	const frameWidth = frameTime * pixelsPerSecond;

	const isCursorOverClip = bladeCursorPosition !== null &&
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

		onSelect(e);

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

		onDragStart(e, dragType);
	};

	return (
		<div
			className={`absolute h-full select-none border-2 rounded ${clip.type === "video" ? "bg-purple-600" : "bg-green-600"} ${
				isSelected ? "border-red-500" : clip.type === "video" ? "border-purple-400" : "border-green-400"
			}`}
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
			<div className="h-full flex items-end px-2 pb-1 overflow-hidden">
				<span className="text-xs text-white truncate">{clip.src.split("/").pop()}</span>
			</div>

			{toolMode === "select" && (
				<>
					<div
						className="absolute left-0 top-0 w-2 h-full cursor-ew-resize"
						onMouseDown={(e) => {
							e.stopPropagation();
							onSelect(e);
							onDragStart(e, "trim-start");
						}}
						onClick={(e) => e.stopPropagation()}
					/>
					<div
						className="absolute right-0 top-0 w-2 h-full cursor-ew-resize"
						onMouseDown={(e) => {
							e.stopPropagation();
							onSelect(e);
							onDragStart(e, "trim-end");
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
