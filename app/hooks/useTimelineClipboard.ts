import { useState, useCallback } from "react";
import { TimelineState, Clip } from "../types/timeline";
import { placeClipOnTimeline } from "../components/timeline/utils";
import { toast } from "sonner";

interface UseTimelineClipboardOptions {
	selectedClips: Array<{ clipId: string; trackId: string }>;
	timelineState: TimelineState;
	currentTimeRef: React.RefObject<number>;
	updateTimelineState: (updater: (prev: TimelineState) => TimelineState) => void;
	setSelectedClips: React.Dispatch<React.SetStateAction<Array<{ clipId: string; trackId: string }>>>;
	setLastSelectedClip: React.Dispatch<React.SetStateAction<{ clipId: string; trackId: string } | null>>;
	onClipSelect?: (selection: { clip: Clip; trackId: string }[] | null) => void;
	onClipAdded?: (trackId: string, clip: Clip) => void;
	onClipRemoved?: (trackId: string, clipId: string) => void;
	canAddClip?: () => { allowed: boolean; reason?: string };
}

interface UseTimelineClipboardReturn {
	clipboard: Array<{ clip: Clip; trackId: string }> | null;
	handleCutClips: () => void;
	handleCopyClips: () => void;
	handlePasteClips: () => void;
	handleDeleteClip: () => void;
}

export function useTimelineClipboard({
	selectedClips,
	timelineState,
	currentTimeRef,
	updateTimelineState,
	setSelectedClips,
	setLastSelectedClip,
	onClipSelect,
	onClipAdded,
	onClipRemoved,
	canAddClip,
}: UseTimelineClipboardOptions): UseTimelineClipboardReturn {
	const [clipboard, setClipboard] = useState<Array<{ clip: Clip; trackId: string }> | null>(null);

	const handleDeleteClip = useCallback(() => {
		if (selectedClips.length === 0) return;

		selectedClips.forEach(({ clipId, trackId }) => {
			onClipRemoved?.(trackId, clipId);
		});

		updateTimelineState((prev) => {
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
	}, [selectedClips, onClipSelect, updateTimelineState, onClipRemoved, setSelectedClips, setLastSelectedClip]);

	const handleCutClips = useCallback(() => {
		if (selectedClips.length === 0) return;

		const clipsToClip: Array<{ clip: Clip; trackId: string }> = [];
		selectedClips.forEach(({ clipId, trackId }) => {
			const track = timelineState.tracks.find((t) => t.id === trackId);
			const clip = track?.clips.find((c) => c.id === clipId);
			if (clip && track) {
				clipsToClip.push({ clip: { ...clip }, trackId });
			}
		});

		setClipboard(clipsToClip);

		selectedClips.forEach(({ clipId, trackId }) => {
			onClipRemoved?.(trackId, clipId);
		});

		updateTimelineState((prev) => {
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
	}, [selectedClips, timelineState, onClipSelect, updateTimelineState, onClipRemoved, setSelectedClips, setLastSelectedClip]);

	const handleCopyClips = useCallback(() => {
		if (selectedClips.length === 0) return;

		const clipsToClip: Array<{ clip: Clip; trackId: string }> = [];
		selectedClips.forEach(({ clipId, trackId }) => {
			const track = timelineState.tracks.find((t) => t.id === trackId);
			const clip = track?.clips.find((c) => c.id === clipId);
			if (clip && track) {
				clipsToClip.push({ clip: { ...clip }, trackId });
			}
		});

		setClipboard(clipsToClip);
	}, [selectedClips, timelineState]);

	const handlePasteClips = useCallback(() => {
		if (!clipboard || clipboard.length === 0) return;

		if (canAddClip) {
			const check = canAddClip();
			if (!check.allowed) {
				toast.error(check.reason || "Cannot paste clips");
				return;
			}
		}

		const minStartTime = Math.min(...clipboard.map((c) => c.clip.startTime));
		const offset = currentTimeRef.current - minStartTime;

		const newClipIds: Array<{ clipId: string; trackId: string }> = [];
		const addedClips: Array<{ trackId: string; clip: Clip }> = [];

		updateTimelineState((prev) => {
			let newState = {
				...prev,
				tracks: prev.tracks.map((t) => ({
					...t,
					clips: [...t.clips],
				})),
			};

			clipboard.forEach(({ clip, trackId }) => {
				const newClip: Clip = {
					...clip,
					id: `clip-${Date.now()}-${Math.random()}`,
					startTime: Math.max(0, clip.startTime + offset),
				};

				if (newClip.startTime + newClip.duration > prev.duration) {
					newClip.duration = prev.duration - newClip.startTime;
				}

				if (newClip.duration <= 0) return;

				const trackIndex = newState.tracks.findIndex((t) => t.id === trackId);
				if (trackIndex !== -1) {
					newState.tracks[trackIndex].clips.push(newClip);
					newState = placeClipOnTimeline(newClip, trackId, newState).state;
					newClipIds.push({ clipId: newClip.id, trackId });
					addedClips.push({ trackId, clip: newClip });
				}
			});

			return newState;
		});

		addedClips.forEach(({ trackId, clip }) => {
			onClipAdded?.(trackId, clip);
		});

		setSelectedClips(newClipIds);
		if (newClipIds.length > 0) {
			setLastSelectedClip(newClipIds[0]);
		}
	}, [clipboard, currentTimeRef, updateTimelineState, onClipAdded, setSelectedClips, setLastSelectedClip, canAddClip]);

	return {
		clipboard,
		handleCutClips,
		handleCopyClips,
		handlePasteClips,
		handleDeleteClip,
	};
}
