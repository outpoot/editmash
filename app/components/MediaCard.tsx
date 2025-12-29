"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { MediaItem } from "../store/mediaStore";
import { viewSettingsStore } from "../store/viewSettingsStore";
import { useAudioWaveform } from "../hooks/useAudioWaveform";
import { HugeiconsIcon } from "@hugeicons/react";
import { Video01Icon, Image01Icon, MusicNote01Icon } from "@hugeicons/core-free-icons";

interface MediaCardProps {
	item: MediaItem;
	index?: number;
	totalCards?: number;
	onDragStart?: (item: MediaItem) => void;
	onDragEnd?: () => void;
}

const round = (value: number, precision = 3) => parseFloat(value.toFixed(precision));
const clamp = (value: number, min = 0, max = 100) => Math.min(Math.max(value, min), max);
const adjust = (value: number, fromMin: number, fromMax: number, toMin: number, toMax: number) =>
	round(toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin));

function AudioWaveformThumbnail({ src, isUploading }: { src: string; isUploading?: boolean }) {
	const peaks = useAudioWaveform(isUploading ? "" : src, 20);

	if (peaks.length === 0) {
		return (
			<div className="w-full h-full flex items-center justify-center">
				<HugeiconsIcon icon={MusicNote01Icon} size={28} strokeWidth={1.5} className="text-neutral-500" />
			</div>
		);
	}

	return (
		<div className="w-full h-full flex items-center justify-center p-2">
			<svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${peaks.length} 2`}>
				<path
					d={
						peaks
							.map((peak, i) => {
								const x = i + 0.5;
								const yMax = 1 - peak.max;
								if (i === 0) return `M ${x} 1 L ${x} ${yMax}`;
								return `L ${x} ${yMax}`;
							})
							.join(" ") +
						" " +
						peaks
							.slice()
							.reverse()
							.map((peak, i) => {
								const x = peaks.length - i - 0.5;
								const yMin = 1 - peak.min;
								return `L ${x} ${yMin}`;
							})
							.join(" ") +
						" Z"
					}
					fill="rgba(80, 80, 80, 0.8)"
					stroke="rgba(120, 120, 120, 0.9)"
					strokeWidth="0.5"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
		</div>
	);
}

export default function MediaCard({ item, index = 0, totalCards = 1, onDragStart, onDragEnd }: MediaCardProps) {
	const cardRef = useRef<HTMLDivElement>(null);
	const [interacting, setInteracting] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [pointer, setPointer] = useState({ x: 50, y: 50 });
	const [background, setBackground] = useState({ x: 50, y: 50 });
	const [rotation, setRotation] = useState({ x: 0, y: 0 });
	const [showShineEffect, setShowShineEffect] = useState(viewSettingsStore.getSettings().showShineEffect);

	useEffect(() => {
		const unsubscribe = viewSettingsStore.subscribe(() => {
			setShowShineEffect(viewSettingsStore.getSettings().showShineEffect);
		});
		return () => { unsubscribe(); };
	}, []);

	const randomSeed = useMemo(() => ({ x: Math.random(), y: Math.random() }), []);

	const fanAngle = useMemo(() => {
		if (totalCards <= 1) return 0;
		const centerIndex = (totalCards - 1) / 2;
		const offset = index - centerIndex;
		return offset * 5;
	}, [index, totalCards]);

	const fanOffset = useMemo(() => {
		if (totalCards <= 1) return 0;
		const centerIndex = (totalCards - 1) / 2;
		const offset = Math.abs(index - centerIndex);
		return offset * 6;
	}, [index, totalCards]);

	const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		if (!cardRef.current) return;

		setInteracting(true);
		const rect = cardRef.current.getBoundingClientRect();
		const absolute = {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
		};
		const percent = {
			x: clamp(round((100 / rect.width) * absolute.x)),
			y: clamp(round((100 / rect.height) * absolute.y)),
		};
		const center = {
			x: percent.x - 50,
			y: percent.y - 50,
		};

		setPointer({ x: round(percent.x), y: round(percent.y) });
		setBackground({
			x: adjust(percent.x, 0, 100, 37, 63),
			y: adjust(percent.y, 0, 100, 33, 67),
		});
		setRotation({
			x: round(-(center.x / 3.5)),
			y: round(center.y / 3.5),
		});
	}, []);

	const handleMouseLeave = useCallback(() => {
		setInteracting(false);
		setPointer({ x: 50, y: 50 });
		setBackground({ x: 50, y: 50 });
		setRotation({ x: 0, y: 0 });
	}, []);

	const handleDragStart = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			if (item.isUploading || item.isDownloading) {
				e.preventDefault();
				return;
			}

			e.dataTransfer.setData("application/media-item", JSON.stringify(item));
			e.dataTransfer.effectAllowed = "copy";

			const transparentImg = document.createElement("img");
			transparentImg.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
			e.dataTransfer.setDragImage(transparentImg, 0, 0);

			setIsDragging(true);
			onDragStart?.(item);
		},
		[item, onDragStart]
	);

	const handleDragEnd = useCallback(() => {
		setIsDragging(false);
		onDragEnd?.();
	}, [onDragEnd]);

	const isUploading = item.isUploading;
	const isDownloading = item.isDownloading;
	const hasError = item.uploadError || item.downloadError;

	const pointerFromCenter = clamp(Math.sqrt((pointer.y - 50) * (pointer.y - 50) + (pointer.x - 50) * (pointer.x - 50)) / 50, 0, 1);

	const fileExt = item.name.split(".").pop()?.toUpperCase() || "";
	const fileName = item.name.replace(/\.[^/.]+$/, "");

	return (
		<div
			ref={cardRef}
			className={`media-card ${item.type} ${interacting ? "interacting" : ""} ${isDragging ? "dragging" : ""} ${
				isUploading || isDownloading ? "uploading" : ""
			}`}
			style={
				{
					"--pointer-x": `${pointer.x}%`,
					"--pointer-y": `${pointer.y}%`,
					"--background-x": `${background.x}%`,
					"--background-y": `${background.y}%`,
					"--rotate-x": `${rotation.x}deg`,
					"--rotate-y": `${rotation.y}deg`,
					"--card-opacity": interacting ? 1 : 0,
					"--pointer-from-center": pointerFromCenter,
					"--pointer-from-left": pointer.x / 100,
					"--pointer-from-top": pointer.y / 100,
					"--seedx": randomSeed.x,
					"--seedy": randomSeed.y,
					"--fan-angle": `${fanAngle}deg`,
					"--fan-offset": `${fanOffset}px`,
					"--card-index": index,
				} as React.CSSProperties
			}
			draggable={!isUploading && !isDownloading}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<div className="media-card__translater">
				<div className="media-card__rotator">
					<div className="media-card__front">
						<div className="media-card__silver" />

						<div className="media-card__thumbnail">
							{item.type === "video" && item.thumbnail ? (
								<img src={item.thumbnail} alt={item.name} />
							) : item.type === "video" ? (
								<div className="media-card__thumbnail-placeholder video">
									<HugeiconsIcon icon={Video01Icon} size={28} strokeWidth={1.5} />
								</div>
							) : item.type === "image" && item.thumbnail ? (
								<img src={item.thumbnail} alt={item.name} />
							) : item.type === "image" ? (
								<div className="media-card__thumbnail-placeholder image">
									<HugeiconsIcon icon={Image01Icon} size={28} strokeWidth={1.5} />
								</div>
							) : (
								<div className="media-card__thumbnail-placeholder audio">
									<AudioWaveformThumbnail src={item.url} isUploading={isUploading} />
								</div>
							)}
						</div>

						<div className="media-card__info">
							<div className="media-card__name" title={item.name}>
								{fileName}
							</div>
							<div className="media-card__meta">
								<span className="media-card__type">{item.type.toUpperCase()}</span>
								{fileExt && <span className="media-card__ext">.{fileExt}</span>}
							</div>
						</div>
						{showShineEffect && <div className="media-card__shine" />}

						<div className="media-card__glare" />

						{(isUploading || isDownloading) && (
							<div className="media-card__progress">
								<div className="text-xs text-white mb-2 font-medium">{isUploading ? `${item.uploadProgress ?? 0}%` : "Loading..."}</div>
								{item.uploadProgress !== undefined && isUploading && (
									<div className="w-full h-1.5 bg-black/50 rounded overflow-hidden">
										<div className="h-full bg-white transition-all duration-300 ease-out" style={{ width: `${item.uploadProgress}%` }} />
									</div>
								)}
								{isDownloading && <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
							</div>
						)}

						{hasError && (
							<div className="media-card__error">
								<span className="text-xs text-center">{item.uploadError || item.downloadError}</span>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
