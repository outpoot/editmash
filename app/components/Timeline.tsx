"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { TimelineState, Clip, DragState } from "../types/timeline";
import TimelineTrack from "./TimelineTrack";
import TimeRuler from "./TimeRuler";
import { ZoomIn, ZoomOut, Play, Pause, MousePointer2, Scissors } from "lucide-react";

// initial demo state
const initialTimelineState: TimelineState = {
	duration: 60,
	tracks: [
		{
			id: "video-1",
			type: "video",
			clips: [
				{
					id: "clip-3",
					type: "video",
					src: "/videos/overlay.mp4",
					startTime: 10,
					duration: 4,
					properties: {
						position: { x: 100, y: 100 },
						size: { width: 640, height: 360 },
					},
				},
			],
		},
		{
			id: "video-0",
			type: "video",
			clips: [
				{
					id: "clip-1",
					type: "video",
					src: "/videos/intro.mp4",
					startTime: 0,
					duration: 5,
					properties: {
						position: { x: 0, y: 0 },
						size: { width: 1920, height: 1080 },
					},
				},
				{
					id: "clip-2",
					type: "video",
					src: "/videos/scene1.mp4",
					startTime: 6,
					duration: 8,
					properties: {
						position: { x: 0, y: 0 },
						size: { width: 1920, height: 1080 },
					},
				},
			],
		},
		{
			id: "audio-0",
			type: "audio",
			clips: [
				{
					id: "clip-4",
					type: "audio",
					src: "/audio/music.mp3",
					startTime: 0,
					duration: 15,
					properties: {
						volume: 0.8,
					},
				},
			],
		},
	],
};

interface TimelineProps {
	onClipSelect?: (selection: { clip: Clip; trackId: string }[] | null) => void;
	currentTime: number;
	currentTimeRef: React.MutableRefObject<number>;
	onTimeChange: (time: number) => void;
	isPlaying: boolean;
	onPlayingChange: (playing: boolean) => void;
	onTimelineStateChange: (state: TimelineState) => void;
}

export default function Timeline({
	onClipSelect,
	currentTime,
	currentTimeRef,
	onTimeChange,
	isPlaying,
	onPlayingChange,
	onTimelineStateChange
}: TimelineProps) {
	const [timelineState, setTimelineState] = useState<TimelineState>(initialTimelineState);
	const [selectedClips, setSelectedClips] = useState<Array<{ clipId: string; trackId: string }>>([]);
	const [pixelsPerSecond, setPixelsPerSecond] = useState(50);
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
	const [toolMode, setToolMode] = useState<"select" | "blade">("select");
	const [bladeCursorPosition, setBladeCursorPosition] = useState<{ x: number; trackId: string } | null>(null);
	const [lastSelectedClip, setLastSelectedClip] = useState<{ clipId: string; trackId: string } | null>(null);

	const timelineRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const trackRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
	const animationFrameRef = useRef<number | null>(null);
	const playbackStartTimeRef = useRef<number>(0);
	const playbackStartPositionRef = useRef<number>(0);
	const playheadElementRef = useRef<HTMLDivElement>(null);
	const lastStateUpdateRef = useRef<number>(0);

	const actualEndTime = useMemo(() => {
		let maxEndTime = 0;
		timelineState.tracks.forEach((track) => {
			track.clips.forEach((clip) => {
				const clipEndTime = clip.startTime + clip.duration;
				if (clipEndTime > maxEndTime) {
					maxEndTime = clipEndTime;
				}
			});
		});
		return maxEndTime;
	}, [timelineState]);

	useEffect(() => {
		onTimelineStateChange(timelineState);
	}, [timelineState, onTimelineStateChange]);

	useEffect(() => {
		if (!isPlaying && playheadElementRef.current) {
			playheadElementRef.current.style.transform = `translateX(${currentTime * pixelsPerSecond}px)`;
		}
	}, [currentTime, pixelsPerSecond, isPlaying]);

	useEffect(() => {
		if (!isPlaying) {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
			return;
		}

		playbackStartTimeRef.current = performance.now();
		playbackStartPositionRef.current = currentTime;
		lastStateUpdateRef.current = performance.now();

		const animate = (timestamp: number) => {
			const elapsed = (timestamp - playbackStartTimeRef.current) / 1000;
			let newTime = playbackStartPositionRef.current + elapsed;

			if (newTime >= actualEndTime) {
				newTime = actualEndTime;
				onPlayingChange(false);
			}

			currentTimeRef.current = newTime;

			if (playheadElementRef.current) {
				const left = newTime * pixelsPerSecond;
				playheadElementRef.current.style.transform = `translateX(${left}px)`;
			}

			// update at ~30fps for frame display
			if (timestamp - lastStateUpdateRef.current > 33) {
				onTimeChange(newTime);
				lastStateUpdateRef.current = timestamp;
			}

			if (newTime < actualEndTime) {
				animationFrameRef.current = requestAnimationFrame(animate);
			}
		};

		animationFrameRef.current = requestAnimationFrame(animate);

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isPlaying]);

	// find which track the mouse is over
	const getTrackAtY = (clientY: number): string | null => {
		for (const [trackId, trackElement] of trackRefsMap.current.entries()) {
			const rect = trackElement.getBoundingClientRect();
			if (clientY >= rect.top && clientY <= rect.bottom) {
				return trackId;
			}
		}
		return null;
	};

	// clip placement on drop
	const handleClipPlacement = (clip: Clip, trackId: string, state: TimelineState): TimelineState => {
		// Deep copy tracks and clips to avoid mutation
		const newState = {
			...state,
			tracks: state.tracks.map((t) => ({
				...t,
				clips: [...t.clips],
			})),
		};
		const track = newState.tracks.find((t) => t.id === trackId);
		if (!track) return state;

		const clipEnd = clip.startTime + clip.duration;
		const otherClips = track.clips.filter((c) => c.id !== clip.id);

		// find overlapping clips
		const overlaps = otherClips.filter((c) => {
			const cStart = c.startTime;
			const cEnd = c.startTime + c.duration;
			return clip.startTime < cEnd && clipEnd > cStart;
		});

		if (overlaps.length === 0) {
			// no overlaps - just place the clip
			return newState;
		}

		for (const overlappingClip of overlaps) {
			const overlapStart = overlappingClip.startTime;
			const overlapEnd = overlappingClip.startTime + overlappingClip.duration;

			// case 1: new clip completely covers the overlapping clip - remove it
			if (clip.startTime <= overlapStart && clipEnd >= overlapEnd) {
				const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
				newState.tracks[trackIndex].clips = newState.tracks[trackIndex].clips.filter((c) => c.id !== overlappingClip.id);
			}
			// case 2: new clip is in the middle of overlapping clip - split it
			else if (clip.startTime > overlapStart && clipEnd < overlapEnd) {
				const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
				const clipIndex = newState.tracks[trackIndex].clips.findIndex((c) => c.id === overlappingClip.id);

				// create left part
				const leftPart = { ...overlappingClip };
				leftPart.duration = clip.startTime - overlapStart;

				// create right part
				const rightPart: Clip = {
					...overlappingClip,
					id: `${overlappingClip.id}-split-${Date.now()}`,
					startTime: clipEnd,
					duration: overlapEnd - clipEnd,
				};

				// Replace original with left part and add right part
				newState.tracks[trackIndex].clips[clipIndex] = leftPart;
				newState.tracks[trackIndex].clips.push(rightPart);
			}
			// case 3: new clip overlaps the start - trim overlapping clip from start
			else if (clip.startTime <= overlapStart && clipEnd > overlapStart && clipEnd < overlapEnd) {
				const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
				const clipIndex = newState.tracks[trackIndex].clips.findIndex((c) => c.id === overlappingClip.id);

				const trimmed = { ...overlappingClip };
				const trimAmount = clipEnd - overlapStart;
				trimmed.startTime = clipEnd;
				trimmed.duration = overlappingClip.duration - trimAmount;

				newState.tracks[trackIndex].clips[clipIndex] = trimmed;
			}
			// case 4: new clip overlaps the end - trim overlapping clip from end
			else if (clip.startTime > overlapStart && clip.startTime < overlapEnd && clipEnd >= overlapEnd) {
				const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
				const clipIndex = newState.tracks[trackIndex].clips.findIndex((c) => c.id === overlappingClip.id);

				const trimmed = { ...overlappingClip };
				trimmed.duration = clip.startTime - overlapStart;

				newState.tracks[trackIndex].clips[clipIndex] = trimmed;
			}
		}

		return newState;
	};

	// handle mouse move and up for dragging
	useEffect(() => {
		if (!dragState) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!timelineRef.current) return;

			const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
			const deltaX = e.clientX - dragState.startX + scrollLeft;
			const deltaY = Math.abs(e.clientY - dragState.startY);

			// 3px threshold to prevent accidental drags
			if (!dragState.hasMoved && Math.abs(deltaX) < 3 && deltaY < 3) {
				return;
			}

			// we moving
			if (!dragState.hasMoved) {
				setDragState((prev) => (prev ? { ...prev, hasMoved: true } : null));
			}

			const deltaTime = deltaX / pixelsPerSecond;

			let currentTrackId = dragState.trackId;
			if (dragState.type === "move") {
				const hoveredTrack = getTrackAtY(e.clientY);
				if (hoveredTrack) {
					currentTrackId = hoveredTrack;
					setHoveredTrackId(hoveredTrack);
				}
			}

			setTimelineState((prev) => {
				// Deep copy tracks and clips to avoid mutation
				const newState = {
					...prev,
					tracks: prev.tracks.map((t) => ({
						...t,
						clips: [...t.clips],
					})),
				};

				const sourceTrackIndex = newState.tracks.findIndex((t) => t.id === dragState.trackId);
				if (sourceTrackIndex === -1) return prev;

				const clipIndex = newState.tracks[sourceTrackIndex].clips.findIndex((c) => c.id === dragState.clipId);
				if (clipIndex === -1) return prev;

				let clip = {
					...newState.tracks[sourceTrackIndex].clips[clipIndex],
				};

				if (dragState.type === "move") {
					let newStartTime = Math.max(0, dragState.startTime + deltaTime);
					newStartTime = Math.min(newStartTime, prev.duration - clip.duration);
					clip.startTime = newStartTime;

					// handle cross-track movement
					if (currentTrackId !== dragState.trackId) {
						const targetTrackIndex = newState.tracks.findIndex((t) => t.id === currentTrackId);
						const targetTrack = newState.tracks[targetTrackIndex];

						// only allow movement to same type track
						if (targetTrack && targetTrack.type === clip.type) {
							newState.tracks[sourceTrackIndex].clips = newState.tracks[sourceTrackIndex].clips.filter((c) => c.id !== dragState.clipId);

							newState.tracks[targetTrackIndex].clips.push(clip);

							setDragState((prev) => (prev ? { ...prev, trackId: currentTrackId } : null));
						} else {
							newState.tracks[sourceTrackIndex].clips[clipIndex] = clip;
						}
					} else {
						// moving within same track - just update position
						newState.tracks[sourceTrackIndex].clips[clipIndex] = clip;
					}
				} else if (dragState.type === "trim-start") {
					const newStartTime = Math.max(0, dragState.startTime + deltaTime);
					const maxStartTime = dragState.startTime + dragState.startDuration - 0.1;
					clip.startTime = Math.min(newStartTime, maxStartTime);
					clip.duration = dragState.startDuration - (clip.startTime - dragState.startTime);
					newState.tracks[sourceTrackIndex].clips[clipIndex] = clip;
				} else if (dragState.type === "trim-end") {
					const newDuration = Math.max(0.1, dragState.startDuration + deltaTime);
					const maxDuration = prev.duration - clip.startTime;
					clip.duration = Math.min(newDuration, maxDuration);
					newState.tracks[sourceTrackIndex].clips[clipIndex] = clip;
				}

				return newState;
			});
		};

		const handleMouseUp = () => {
			if (dragState && dragState.type === "move" && dragState.hasMoved) {
				setTimelineState((prev) => {
					const track = prev.tracks.find((t) => t.id === dragState.trackId);
					const clip = track?.clips.find((c) => c.id === dragState.clipId);

					if (!clip) return prev;

					return handleClipPlacement(clip, dragState.trackId, prev);
				});
			}

			setDragState(null);
			setHoveredTrackId(null);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [dragState, pixelsPerSecond]);

	const handleClipSelect = (clipId: string, trackId: string, event?: { ctrlKey: boolean; shiftKey: boolean }) => {
		const ctrlKey = event?.ctrlKey || false;
		const shiftKey = event?.shiftKey || false;

		if (shiftKey && lastSelectedClip) {
			// Range selection
			const allClips: Array<{ clipId: string; trackId: string }> = [];
			timelineState.tracks.forEach((track) => {
				track.clips.forEach((clip) => {
					allClips.push({ clipId: clip.id, trackId: track.id });
				});
			});

			const lastIndex = allClips.findIndex((c) => c.clipId === lastSelectedClip.clipId && c.trackId === lastSelectedClip.trackId);
			const currentIndex = allClips.findIndex((c) => c.clipId === clipId && c.trackId === trackId);

			if (lastIndex !== -1 && currentIndex !== -1) {
				const start = Math.min(lastIndex, currentIndex);
				const end = Math.max(lastIndex, currentIndex);
				const rangeClips = allClips.slice(start, end + 1);
				setSelectedClips(rangeClips);

				const selections = rangeClips.map((c) => {
					const track = timelineState.tracks.find((t) => t.id === c.trackId);
					const clip = track?.clips.find((cl) => cl.id === c.clipId);
					return clip ? { clip, trackId: c.trackId } : null;
				}).filter((s): s is { clip: Clip; trackId: string } => s !== null);

				onClipSelect?.(selections);
			}
		} else if (ctrlKey) {
			const isAlreadySelected = selectedClips.some((c) => c.clipId === clipId && c.trackId === trackId);

			let newSelection: Array<{ clipId: string; trackId: string }>;
			if (isAlreadySelected) {
				newSelection = selectedClips.filter((c) => !(c.clipId === clipId && c.trackId === trackId));
			} else {
				newSelection = [...selectedClips, { clipId, trackId }];
			}

			setSelectedClips(newSelection);
			setLastSelectedClip({ clipId, trackId });

			if (newSelection.length === 0) {
				onClipSelect?.(null);
			} else {
				const selections = newSelection.map((c) => {
					const track = timelineState.tracks.find((t) => t.id === c.trackId);
					const clip = track?.clips.find((cl) => cl.id === c.clipId);
					return clip ? { clip, trackId: c.trackId } : null;
				}).filter((s): s is { clip: Clip; trackId: string } => s !== null);

				onClipSelect?.(selections);
			}
		} else {
			// Single selection
			setSelectedClips([{ clipId, trackId }]);
			setLastSelectedClip({ clipId, trackId });

			const track = timelineState.tracks.find((t) => t.id === trackId);
			const clip = track?.clips.find((c) => c.id === clipId);

			if (clip) {
				onClipSelect?.([{ clip, trackId }]);
			}
		}
	};

	const handleClipDragStart = (e: React.MouseEvent, clipId: string, trackId: string, type: "move" | "trim-start" | "trim-end") => {
		// If this clip is not in the selection, select only this clip
		const isInSelection = selectedClips.some((c) => c.clipId === clipId && c.trackId === trackId);
		if (!isInSelection) {
			setSelectedClips([{ clipId, trackId }]);
			setLastSelectedClip({ clipId, trackId });
		}

		const track = timelineState.tracks.find((t) => t.id === trackId);
		const clip = track?.clips.find((c) => c.id === clipId);

		if (!clip) return;

		const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;

		setDragState({
			clipId,
			trackId,
			type,
			startX: e.clientX - scrollLeft,
			startY: e.clientY,
			startTime: clip.startTime,
			startDuration: clip.duration,
			originalTrackId: trackId,
			currentTrackId: trackId,
			hasMoved: false,
		});
	};

	const handleDeleteClip = useCallback(() => {
		if (selectedClips.length === 0) return;

		setTimelineState((prev) => {
			// Deep copy tracks and clips to avoid mutation
			const newState = {
				...prev,
				tracks: prev.tracks.map((t) => ({
					...t,
					clips: [...t.clips],
				})),
			};

			selectedClips.forEach(({ clipId, trackId }) => {
				const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
				if (trackIndex !== -1) {
					newState.tracks[trackIndex].clips = newState.tracks[trackIndex].clips.filter((c) => c.id !== clipId);
				}
			});

			return newState;
		});

		setSelectedClips([]);
		setLastSelectedClip(null);
		onClipSelect?.(null);
	}, [selectedClips, onClipSelect]);

	const handleZoomIn = useCallback(() => {
		setPixelsPerSecond((prev) => Math.min(prev + 10, 200));
	}, []);

	const handleZoomOut = useCallback(() => {
		setPixelsPerSecond((prev) => Math.max(prev - 10, 10));
	}, []);

	const handleSeek = useCallback((time: number) => {
		currentTimeRef.current = time;
		onTimeChange(time);
	}, [onTimeChange, currentTimeRef]);

	const handlePlayPause = useCallback(() => {
		onPlayingChange(!isPlaying);
	}, [isPlaying, onPlayingChange]);

	const handleTimelineClick = () => {
		setSelectedClips([]);
		setLastSelectedClip(null);
		onClipSelect?.(null);
	};

	const handleTrackMouseMove = useCallback((e: React.MouseEvent, trackId: string) => {
		if (toolMode !== "blade") {
			setBladeCursorPosition(null);
			return;
		}

		const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
		const rect = timelineRef.current?.getBoundingClientRect();
		if (!rect) return;

		const mouseX = e.clientX - rect.left + scrollLeft;
		const mouseTime = mouseX / pixelsPerSecond;

		const fps = 30;
		const frameTime = 1 / fps;
		const snappedTime = Math.round(mouseTime / frameTime) * frameTime;
		const snappedX = snappedTime * pixelsPerSecond;

		setBladeCursorPosition({ x: snappedX, trackId });
	}, [toolMode, pixelsPerSecond]);

	const handleBladeClick = useCallback((e: React.MouseEvent, trackId: string) => {
		if (toolMode !== "blade") return;

		e.stopPropagation();

		const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
		const rect = timelineRef.current?.getBoundingClientRect();
		if (!rect) return;

		const clickX = e.clientX - rect.left + scrollLeft;
		const mouseTime = clickX / pixelsPerSecond;

		const fps = 30;
		const frameTime = 1 / fps;
		const clickTime = Math.round(mouseTime / frameTime) * frameTime;

		setTimelineState((prev) => {
			const newState = {
				...prev,
				tracks: prev.tracks.map((t) => ({
					...t,
					clips: [...t.clips],
				})),
			};

			const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
			if (trackIndex === -1) return prev;

			const track = newState.tracks[trackIndex];

			// find clip at click position
			const clipIndex = track.clips.findIndex((c) => {
				const clipEnd = c.startTime + c.duration;
				return clickTime >= c.startTime && clickTime < clipEnd;
			});

			if (clipIndex === -1) return prev;

			const clipToSplit = track.clips[clipIndex];

			// don't split at exact start or end of clip
			const fps = 30;
			const frameTime = 1 / fps;
			if (clickTime <= clipToSplit.startTime || clickTime >= clipToSplit.startTime + clipToSplit.duration - frameTime) {
				return prev;
			}

			// create left part
			const leftPart = {
				...clipToSplit,
				duration: clickTime - clipToSplit.startTime,
			};

			// create right part
			const rightPart: Clip = {
				...clipToSplit,
				id: `${clipToSplit.id}-split-${Date.now()}`,
				startTime: clickTime,
				duration: clipToSplit.startTime + clipToSplit.duration - clickTime,
			};

			// replace original with left part and add right part
			newState.tracks[trackIndex].clips[clipIndex] = leftPart;
			newState.tracks[trackIndex].clips.push(rightPart);

			return newState;
		});
	}, [toolMode, pixelsPerSecond]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't trigger shortcuts if user is typing in an input
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}

			if (e.key === " ") {
				e.preventDefault();
				handlePlayPause();
			} else if (e.key === "a" || e.key === "A") {
				e.preventDefault();
				setToolMode("select");
			} else if (e.key === "b" || e.key === "B") {
				e.preventDefault();
				setToolMode("blade");
			} else if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
				e.preventDefault();
				handleZoomIn();
			} else if (e.ctrlKey && e.key === "-") {
				e.preventDefault();
				handleZoomOut();
			} else if (e.key === "Backspace" || e.key === "Delete") {
				if (selectedClips.length > 0) {
					handleDeleteClip();
				}
			} else if (e.key === "Escape") {
				setSelectedClips([]);
				setLastSelectedClip(null);
				onClipSelect?.(null);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [selectedClips, onClipSelect, handleDeleteClip, handleZoomIn, handleZoomOut, handlePlayPause]);

	const timelineWidth = timelineState.duration * pixelsPerSecond;

	return (
		<div className="h-full bg-[#1a1a1a] border-t border-zinc-800 flex flex-col">
			{/* Toolbar */}
			<div className="h-10 bg-[#1e1e1e] border-b border-zinc-800 flex items-center justify-between px-4">
				<div className="flex items-center gap-3">
					<button
						onClick={handlePlayPause}
						className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200"
						title={isPlaying ? "Pause" : "Play"}
					>
						{isPlaying ? <Pause size={16} /> : <Play size={16} />}
					</button>
					<div className="w-px h-6 bg-zinc-700" />
					<div className="flex items-center gap-1">
						<button
							onClick={() => setToolMode("select")}
							className={`p-1.5 rounded ${
								toolMode === "select"
									? "bg-blue-600 text-white"
									: "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
							}`}
							title="Select Mode (A)"
						>
							<MousePointer2 size={16} />
						</button>
						<button
							onClick={() => setToolMode("blade")}
							className={`p-1.5 rounded ${
								toolMode === "blade"
									? "bg-blue-600 text-white"
									: "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
							}`}
							title="Blade Mode (B)"
						>
							<Scissors size={16} />
						</button>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1">
						<button onClick={handleZoomOut} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="Zoom out">
							<ZoomOut size={16} />
						</button>
						<span className="text-xs text-zinc-500 w-12 text-center">{Math.round((pixelsPerSecond / 50) * 100)}%</span>
						<button onClick={handleZoomIn} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="Zoom in">
							<ZoomIn size={16} />
						</button>
					</div>
				</div>
			</div>

			{/* timeline area */}
			<div
				ref={scrollContainerRef}
				className="flex-1 overflow-auto relative"
				style={{ cursor: toolMode === "blade" ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M9 3H5a2 2 0 0 0-2 2v4m6-6v6.5m0 0l-3.5 3.5M9 9.5l3.5 3.5M19 3h4m0 0v4m0-4l-7 7m7 10v-4m0 4h-4m4 0l-7-7'/%3E%3C/svg%3E\") 12 12, crosshair" : "default" }}
				onClick={handleTimelineClick}
			>
				<div className="min-w-full inline-block" style={{ width: `${timelineWidth + 200}px` }}>
					{/* Time ruler */}
					<div className="flex">
						<div className="w-32 flex-shrink-0 bg-[#1e1e1e] border-r border-zinc-800 h-8 flex items-center justify-center">
							<span className="text-sm text-zinc-300 font-mono tabular-nums">
								{Math.floor(currentTime / 60)
									.toString()
									.padStart(2, "0")}
								:{Math.floor(currentTime % 60)
									.toString()
									.padStart(2, "0")}
								:{Math.floor((currentTime % 1) * 30)
									.toString()
									.padStart(2, "0")}
							</span>
						</div>
						<div className="flex-1" ref={timelineRef}>
							<TimeRuler duration={actualEndTime} pixelsPerSecond={pixelsPerSecond} onSeek={handleSeek} />
						</div>
					</div>

					{/* Tracks */}
					<div className="relative">
						{timelineState.tracks.map((track) => (
							<div
								key={track.id}
								ref={(el) => {
									if (el) {
										trackRefsMap.current.set(track.id, el);
									} else {
										trackRefsMap.current.delete(track.id);
									}
								}}
							>
								<TimelineTrack
									track={track}
									pixelsPerSecond={pixelsPerSecond}
									selectedClips={selectedClips}
									draggedClipId={dragState?.clipId || null}
									isHovered={hoveredTrackId === track.id}
									onClipSelect={handleClipSelect}
									onClipDragStart={handleClipDragStart}
									onTrackClick={handleTimelineClick}
									onTrackMouseEnter={() => setHoveredTrackId(track.id)}
									toolMode={toolMode}
									onBladeClick={handleBladeClick}
									onTrackMouseMove={handleTrackMouseMove}
									bladeCursorPosition={bladeCursorPosition?.trackId === track.id ? bladeCursorPosition.x : null}
								/>
							</div>
						))}
					</div>

					{/* Playhead */}
					<div
						ref={playheadElementRef}
						className="absolute z-[60]"
						style={{
							left: `${128}px`,
							top: 0,
							height: "100%",
							pointerEvents: "none",
							willChange: isPlaying ? "transform" : "auto",
						}}
					>
						{/* Playhead line */}
						<div className="absolute w-0.5 bg-red-500 h-full" />

						{/* Triangle */}
						<svg
							width="12"
							height="10"
							viewBox="0 0 12 10"
							className="absolute top-0 cursor-ew-resize"
							style={{
								pointerEvents: "auto",
								left: "1px",
								transform: "translateX(-50%)",
								display: "block",
							}}
							onMouseDown={(e) => {
								e.stopPropagation();
								const startX = e.clientX;
								const startTime = currentTime;

								const handleMouseMove = (moveEvent: MouseEvent) => {
									const deltaX = moveEvent.clientX - startX;
									const deltaTime = deltaX / pixelsPerSecond;
									const newTime = Math.max(0, Math.min(startTime + deltaTime, actualEndTime));

									currentTimeRef.current = newTime;
									onTimeChange(newTime);

									if (playheadElementRef.current) {
										playheadElementRef.current.style.transform = `translateX(${newTime * pixelsPerSecond}px)`;
									}
								};

								const handleMouseUp = () => {
									window.removeEventListener("mousemove", handleMouseMove);
									window.removeEventListener("mouseup", handleMouseUp);
								};

								window.addEventListener("mousemove", handleMouseMove);
								window.addEventListener("mouseup", handleMouseUp);
							}}
						>
							<path d="M6 10 L12 0 L0 0 Z" fill="#ef4444" />
						</svg>
					</div>
				</div>
			</div>
		</div>
	);
}
