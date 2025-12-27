import { useState, useRef, useCallback } from "react";
import { TimelineState, Clip } from "../types/timeline";

interface UseTimelineSelectionOptions {
	timelineState: TimelineState;
	onClipSelect?: (selection: { clip: Clip; trackId: string }[] | null) => void;
}

interface UseTimelineSelectionReturn {
	selectedClips: Array<{ clipId: string; trackId: string }>;
	setSelectedClips: React.Dispatch<React.SetStateAction<Array<{ clipId: string; trackId: string }>>>;
	lastSelectedClip: { clipId: string; trackId: string } | null;
	setLastSelectedClip: React.Dispatch<React.SetStateAction<{ clipId: string; trackId: string } | null>>;
	handleClipSelect: (clipId: string, trackId: string, event?: { ctrlKey: boolean; shiftKey: boolean }) => void;
	clearSelection: () => void;
}

export function useTimelineSelection({ timelineState, onClipSelect }: UseTimelineSelectionOptions): UseTimelineSelectionReturn {
	const [selectedClips, setSelectedClips] = useState<Array<{ clipId: string; trackId: string }>>([]);
	const [lastSelectedClip, setLastSelectedClip] = useState<{ clipId: string; trackId: string } | null>(null);

	const timelineStateRef = useRef(timelineState);
	timelineStateRef.current = timelineState;
	const selectedClipsRef = useRef(selectedClips);
	selectedClipsRef.current = selectedClips;
	const lastSelectedClipRef = useRef(lastSelectedClip);
	lastSelectedClipRef.current = lastSelectedClip;
	const onClipSelectRef = useRef(onClipSelect);
	onClipSelectRef.current = onClipSelect;

	const handleClipSelect = useCallback((clipId: string, trackId: string, event?: { ctrlKey: boolean; shiftKey: boolean }) => {
		const ctrlKey = event?.ctrlKey || false;
		const shiftKey = event?.shiftKey || false;
		const currentTimelineState = timelineStateRef.current;
		const currentSelectedClips = selectedClipsRef.current;
		const currentLastSelectedClip = lastSelectedClipRef.current;
		const currentOnClipSelect = onClipSelectRef.current;

		if (shiftKey && currentLastSelectedClip) {
			const allClips: Array<{ clipId: string; trackId: string }> = [];
			currentTimelineState.tracks.forEach((track) => {
				track.clips.forEach((clip) => {
					allClips.push({ clipId: clip.id, trackId: track.id });
				});
			});

			const lastIndex = allClips.findIndex(
				(c) => c.clipId === currentLastSelectedClip.clipId && c.trackId === currentLastSelectedClip.trackId
			);
			const currentIndex = allClips.findIndex((c) => c.clipId === clipId && c.trackId === trackId);

			if (lastIndex !== -1 && currentIndex !== -1) {
				const start = Math.min(lastIndex, currentIndex);
				const end = Math.max(lastIndex, currentIndex);
				const rangeClips = allClips.slice(start, end + 1);
				setSelectedClips(rangeClips);

				const selections = rangeClips
					.map((c) => {
						const track = currentTimelineState.tracks.find((t) => t.id === c.trackId);
						const clip = track?.clips.find((cl) => cl.id === c.clipId);
						return clip ? { clip, trackId: c.trackId } : null;
					})
					.filter((s): s is { clip: Clip; trackId: string } => s !== null);

				currentOnClipSelect?.(selections);
			}
		} else if (ctrlKey) {
			const isAlreadySelected = currentSelectedClips.some((c) => c.clipId === clipId && c.trackId === trackId);

			let newSelection: Array<{ clipId: string; trackId: string }>;
			if (isAlreadySelected) {
				newSelection = currentSelectedClips.filter((c) => !(c.clipId === clipId && c.trackId === trackId));
			} else {
				newSelection = [...currentSelectedClips, { clipId, trackId }];
			}

			setSelectedClips(newSelection);
			setLastSelectedClip({ clipId, trackId });

			if (newSelection.length === 0) {
				currentOnClipSelect?.(null);
			} else {
				const selections = newSelection
					.map((c) => {
						const track = currentTimelineState.tracks.find((t) => t.id === c.trackId);
						const clip = track?.clips.find((cl) => cl.id === c.clipId);
						return clip ? { clip, trackId: c.trackId } : null;
					})
					.filter((s): s is { clip: Clip; trackId: string } => s !== null);

				currentOnClipSelect?.(selections);
			}
		} else {
			setSelectedClips([{ clipId, trackId }]);
			setLastSelectedClip({ clipId, trackId });

			const track = currentTimelineState.tracks.find((t) => t.id === trackId);
			const clip = track?.clips.find((c) => c.id === clipId);

			if (clip) {
				currentOnClipSelect?.([{ clip, trackId }]);
			}
		}
	}, []);

	const clearSelection = useCallback(() => {
		setSelectedClips([]);
		setLastSelectedClip(null);
		onClipSelectRef.current?.(null);
	}, []);

	return {
		selectedClips,
		setSelectedClips,
		lastSelectedClip,
		setLastSelectedClip,
		handleClipSelect,
		clearSelection,
	};
}
