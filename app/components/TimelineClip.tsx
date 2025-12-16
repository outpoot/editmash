import { memo } from "react";
import { Clip, VideoClip, ImageClip, AudioClip } from "../types/timeline";
import { useVideoThumbnails } from "../hooks/useVideoThumbnails";
import { useAudioWaveform } from "../hooks/useAudioWaveform";
import { Snowflake } from "lucide-react";

interface TimelineClipProps {
	clip: Clip;
	trackId: string;
	pixelsPerSecond: number;
	isSelected: boolean;
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
	onSelect,
	onDragStart,
	toolMode,
	onBladeClick,
	bladeCursorPosition,
}: TimelineClipProps) {
	const left = clip.startTime * pixelsPerSecond;
	const width = clip.duration * pixelsPerSecond;
	const clipEnd = left + width;

	const shouldGenerateThumbnails = clip.type === "video" && !clip.thumbnail;
	const thumbnailCount = shouldGenerateThumbnails ? Math.max(5, Math.ceil(clip.duration / 2)) : 0;
	const generatedThumbnails = useVideoThumbnails(shouldGenerateThumbnails ? clip.src : "", clip.duration, thumbnailCount);

	const thumbnails =
		clip.type === "image" ? (clip.thumbnail ? [clip.thumbnail] : []) : clip.thumbnail ? [clip.thumbnail] : generatedThumbnails;

	const waveformSampleCount = Math.max(50, Math.ceil(width / 3));
	const waveformPeaks = useAudioWaveform(
		clip.type === "audio" ? clip.src : "",
		waveformSampleCount,
		clip.type === "audio" ? { sourceIn: clip.sourceIn, sourceDuration: clip.duration } : {}
	);

	const volumeMultiplier = clip.type === "audio" ? (clip as AudioClip).properties.volume : 1;

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
				clip.type === "video" || clip.type === "image" ? "bg-purple-600" : "bg-green-600"
			} ${isSelected ? "border-primary" : "border-border"}`}
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
			{(clip.type === "video" || clip.type === "image") && thumbnails.length > 0 && (
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

			{clip.type === "audio" && waveformPeaks.length > 0 && (
				<div className="absolute inset-0 flex items-center pointer-events-none px-1">
					<svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${waveformPeaks.length} 2`}>
						<path
							d={waveformPeaks
								.map((peak, i) => {
									const x = i + 0.5;
									const yMax = 1 - peak.max * volumeMultiplier;
									const yMin = 1 - peak.min * volumeMultiplier;

									if (i === 0) {
										return `M ${x} ${yMax} L ${x} ${yMin}`;
									}
									return `L ${x} ${yMax} L ${x} ${yMin}`;
								})
								.join(" ")}
							fill="none"
							stroke="rgba(255, 255, 255, 0.8)"
							strokeWidth="1"
							vectorEffect="non-scaling-stroke"
						/>
						<path
							d={
								waveformPeaks
									.map((peak, i) => {
										const x = i + 0.5;
										const yMax = 1 - peak.max * volumeMultiplier;
										if (i === 0) return `M ${x} 1 L ${x} ${yMax}`;
										return `L ${x} ${yMax}`;
									})
									.join(" ") +
								" " +
								waveformPeaks
									.slice()
									.reverse()
									.map((peak, i) => {
										const x = waveformPeaks.length - i - 0.5;
										const yMin = 1 - peak.min * volumeMultiplier;
										return `L ${x} ${yMin}`;
									})
									.join(" ") +
								" Z"
							}
							fill="rgba(255, 255, 255, 0.6)"
							stroke="none"
						/>
					</svg>
				</div>
			)}

			<div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

			<div className="relative h-full flex items-end px-2 pb-1 overflow-hidden">
				<span className="text-xs text-white truncate drop-shadow-md">{clip.name}</span>
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
