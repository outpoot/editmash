import { memo, useState, useEffect, useCallback } from "react";
import { Clip, VideoClip, ImageClip, AudioClip } from "../types/timeline";
import { useVideoThumbnails } from "../hooks/useVideoThumbnails";
import { useAudioWaveform } from "../hooks/useAudioWaveform";
import { viewSettingsStore } from "../store/viewSettingsStore";
import { HugeiconsIcon } from "@hugeicons/react";
import { SnowIcon } from "@hugeicons/core-free-icons";

interface RemoteSelector {
	userId: string;
	username: string;
	userImage?: string;
	highlightColor: string;
}

export interface ClipChangeNotification {
	id: string;
	message: string;
	timestamp: number;
}

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
	remoteSelectors?: RemoteSelector[];
	changeNotifications?: ClipChangeNotification[];
}

function ChangeNotification({ message, onComplete }: { message: string; onComplete: () => void }) {
	useEffect(() => {
		const removeTimer = setTimeout(onComplete, 500);
		return () => clearTimeout(removeTimer);
	}, [onComplete]);

	return (
		<div
			className="absolute left-1/2 text-[10px] text-white whitespace-nowrap"
			style={{
				textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)",
				top: "50%",
				animation: "clipNotification 0.5s ease-out forwards",
			}}
		>
			{message}
		</div>
	);
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
	remoteSelectors,
	changeNotifications = [],
}: TimelineClipProps) {
	const [localNotifications, setLocalNotifications] = useState<ClipChangeNotification[]>([]);
	const [showRemoteSelections, setShowRemoteSelections] = useState(viewSettingsStore.getSettings().showRemoteSelections);
	const [showRemoteNotifications, setShowRemoteNotifications] = useState(viewSettingsStore.getSettings().showRemoteClipNotifications);

	useEffect(() => {
		const unsubscribe = viewSettingsStore.subscribe(() => {
			const settings = viewSettingsStore.getSettings();
			setShowRemoteSelections(settings.showRemoteSelections);
			setShowRemoteNotifications(settings.showRemoteClipNotifications);
		});
		return () => { unsubscribe(); };
	}, []);

	useEffect(() => {
		if (changeNotifications.length > 0 && showRemoteNotifications) {
			setLocalNotifications((prev) => {
				const existingIds = new Set(prev.map((n) => n.id));
				const newNotifications = changeNotifications.filter((n) => !existingIds.has(n.id));
				if (newNotifications.length === 0) return prev;
				return [...prev, ...newNotifications];
			});
		}
	}, [changeNotifications, showRemoteNotifications]);

	const removeNotification = useCallback((id: string) => {
		setLocalNotifications((prev) => prev.filter((n) => n.id !== id));
	}, []);

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
			className="absolute h-full"
			style={{
				left: `${left}px`,
				width: `${width}px`,
				top: "0",
				zIndex: isSelected ? 50 : 10,
			}}
		>
			{/* selection avatars */}
			{showRemoteSelections && remoteSelectors && remoteSelectors.length > 0 && (
				<div className="absolute -top-1 -right-1 flex flex-row-reverse gap-0.5 pointer-events-none z-10">
					{remoteSelectors.slice(0, 5).map((selector) => (
						<div
							key={selector.userId}
							className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center text-[8px] font-medium border border-background"
							style={{
								backgroundColor: selector.highlightColor,
							}}
							title={selector.username}
						>
							{selector.userImage ? (
								<img src={selector.userImage} alt={selector.username} className="w-full h-full object-cover" />
							) : (
								<span className="text-white drop-shadow">{selector.username.charAt(0).toUpperCase()}</span>
							)}
						</div>
					))}
					{remoteSelectors.length > 5 && (
						<div
							className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[7px] font-medium text-muted-foreground border border-background"
							title={`+${remoteSelectors.length - 5} more`}
						>
							+{remoteSelectors.length - 5}
						</div>
					)}
				</div>
			)}

			<div
				className={`absolute inset-0 select-none border-2 rounded overflow-hidden ${
					clip.type === "video" || clip.type === "image" ? "bg-purple-600" : "bg-green-600"
				} ${isSelected ? "border-red-500" : "border-border"}`}
				style={{
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
									className="h-full object-cover shrink-0"
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

				<div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent pointer-events-none" />

				<div className="relative h-full flex items-end px-2 pb-1 overflow-hidden">
					<span className="text-xs text-white truncate drop-shadow-md">{clip.name}</span>
				</div>

				{clip.type === "video" && (clip as VideoClip).properties.freezeFrame && (
					<div className="absolute top-1 right-1 pointer-events-none">
						<HugeiconsIcon icon={SnowIcon} className="w-4 h-4 text-cyan-400 drop-shadow-md" />
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
						className="absolute top-0 h-full w-0.5 bg-red-500 pointer-events-none z-50"
						style={{
							left: `${cutLinePosition}px`,
							boxShadow: "0 0 4px rgba(239, 68, 68, 0.8)",
						}}
					/>
				)}

				{/* Remote user selection border highlight */}
				{showRemoteSelections && remoteSelectors && remoteSelectors.length > 0 && (
					<div
						className="absolute inset-0 pointer-events-none rounded border-2"
						style={{
							borderColor: remoteSelectors[0].highlightColor,
						}}
					/>
				)}
			</div>

			{showRemoteNotifications && localNotifications.length > 0 && (
				<div className="absolute inset-0 pointer-events-none z-100">
					{localNotifications.map((notification) => (
						<ChangeNotification
							key={notification.id}
							message={notification.message}
							onComplete={() => removeNotification(notification.id)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export default memo(TimelineClip);
