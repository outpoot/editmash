import { useEffect, useCallback } from "react";
import type { ToolMode, TransformMode } from "../components/timeline/TimelineToolbar";

interface UseTimelineKeyboardOptions {
	selectedClipsCount: number;
	onPlayPause: () => void;
	onToolModeChange: (mode: ToolMode) => void;
	onTransformModeChange: (mode: TransformMode) => void;
	onSnappingToggle: () => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onCut: () => void;
	onCopy: () => void;
	onPaste: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onDelete: () => void;
	onClearSelection: () => void;
	transformMode: TransformMode;
}

export function useTimelineKeyboard({
	selectedClipsCount,
	onPlayPause,
	onToolModeChange,
	onTransformModeChange,
	onSnappingToggle,
	onZoomIn,
	onZoomOut,
	onCut,
	onCopy,
	onPaste,
	onUndo,
	onRedo,
	onDelete,
	onClearSelection,
	transformMode,
}: UseTimelineKeyboardOptions) {
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}

			if (e.key === " ") {
				e.preventDefault();
				onPlayPause();
			} else if (e.key === "a" || e.key === "A") {
				e.preventDefault();
				onToolModeChange("select");
			} else if (e.key === "b" || e.key === "B") {
				e.preventDefault();
				onToolModeChange("blade");
			} else if (e.key === "t" || e.key === "T") {
				e.preventDefault();
				onTransformModeChange(transformMode === "transform" ? null : "transform");
			} else if (e.key === "c" && !e.ctrlKey) {
				e.preventDefault();
				onTransformModeChange(transformMode === "crop" ? null : "crop");
			} else if (e.key === "n" || e.key === "N") {
				e.preventDefault();
				onSnappingToggle();
			} else if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
				e.preventDefault();
				onZoomIn();
			} else if (e.ctrlKey && e.key === "-") {
				e.preventDefault();
				onZoomOut();
			} else if (e.ctrlKey && e.key === "x") {
				e.preventDefault();
				onCut();
			} else if (e.ctrlKey && e.key === "c") {
				e.preventDefault();
				onCopy();
			} else if (e.ctrlKey && e.key === "v") {
				e.preventDefault();
				onPaste();
			} else if (e.ctrlKey && e.key === "z") {
				e.preventDefault();
				onUndo();
			} else if (e.ctrlKey && e.key === "y") {
				e.preventDefault();
				onRedo();
			} else if (e.key === "Backspace" || e.key === "Delete") {
				if (selectedClipsCount > 0) {
					onDelete();
				}
			} else if (e.key === "Escape") {
				onClearSelection();
			}
		},
		[
			selectedClipsCount,
			onPlayPause,
			onToolModeChange,
			onTransformModeChange,
			onSnappingToggle,
			onZoomIn,
			onZoomOut,
			onCut,
			onCopy,
			onPaste,
			onUndo,
			onRedo,
			onDelete,
			onClearSelection,
			transformMode,
		]
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);
}
