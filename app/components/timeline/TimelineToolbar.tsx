"use client";

import { memo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	SearchAddIcon,
	SearchMinusIcon,
	PlayIcon,
	PauseIcon,
	Cursor01Icon,
	ScissorIcon,
	MagnetIcon,
	Undo02Icon,
	Redo02Icon,
	SquareIcon,
	CropIcon,
	ArrowDown01Icon,
} from "@hugeicons/core-free-icons";

export type ToolMode = "select" | "blade";
export type TransformMode = "transform" | "crop" | null;

interface TimelineToolbarProps {
	isPlaying: boolean;
	onPlayPause: () => void;
	toolMode: ToolMode;
	onToolModeChange: (mode: ToolMode) => void;
	transformMode: TransformMode;
	onTransformModeChange: (mode: TransformMode) => void;
	showTransformMenu: boolean;
	onShowTransformMenuChange: (show: boolean) => void;
	isSnappingEnabled: boolean;
	onSnappingChange: (enabled: boolean) => void;
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	pixelsPerSecond: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
}

function TimelineToolbar({
	isPlaying,
	onPlayPause,
	toolMode,
	onToolModeChange,
	transformMode,
	onTransformModeChange,
	showTransformMenu,
	onShowTransformMenuChange,
	isSnappingEnabled,
	onSnappingChange,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	pixelsPerSecond,
	onZoomIn,
	onZoomOut,
}: TimelineToolbarProps) {
	return (
		<div className="h-10 bg-card border-b border-border flex items-center justify-between px-4">
			<div className="flex items-center gap-3">
				<button
					onClick={onPlayPause}
					className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
					title={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? <HugeiconsIcon icon={PauseIcon} size={16} /> : <HugeiconsIcon icon={PlayIcon} size={16} />}
				</button>
				<div className="w-px h-6 bg-border" />
				<div className="flex items-center gap-1">
					<button
						onClick={() => onToolModeChange("select")}
						className={`p-1.5 rounded ${
							toolMode === "select" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
						}`}
						title="Select Mode (A)"
					>
						<HugeiconsIcon icon={Cursor01Icon} size={16} />
					</button>
					<button
						onClick={() => onToolModeChange("blade")}
						className={`p-1.5 rounded ${
							toolMode === "blade" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
						}`}
						title="Blade Mode (B)"
					>
						<HugeiconsIcon icon={ScissorIcon} size={16} />
					</button>
					<div className="relative">
						<button
							onClick={() => {
								if (transformMode) {
									onTransformModeChange(null);
									onShowTransformMenuChange(false);
								} else {
									onTransformModeChange("transform");
								}
							}}
							className={`p-1.5 rounded ${
								transformMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
							}`}
							title="Transform Mode"
						>
							{transformMode === "crop" ? <HugeiconsIcon icon={CropIcon} size={16} /> : <HugeiconsIcon icon={SquareIcon} size={16} />}
						</button>
						<button
							onClick={() => onShowTransformMenuChange(!showTransformMenu)}
							className="p-1.5 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
							title="Transform options"
						>
							<HugeiconsIcon icon={ArrowDown01Icon} size={12} />
						</button>
						{showTransformMenu && (
							<div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded shadow-lg z-50 min-w-[120px]">
								<button
									onClick={() => {
										onTransformModeChange("transform");
										onShowTransformMenuChange(false);
									}}
									className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
								>
									<HugeiconsIcon icon={SquareIcon} size={14} />
									Transform
								</button>
								<button
									onClick={() => {
										onTransformModeChange("crop");
										onShowTransformMenuChange(false);
									}}
									className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
								>
									<HugeiconsIcon icon={CropIcon} size={14} />
									Crop
								</button>
							</div>
						)}
					</div>
				</div>
				<div className="w-px h-6 bg-border" />
				<button
					onClick={() => onSnappingChange(!isSnappingEnabled)}
					className={`p-1.5 rounded ${
						isSnappingEnabled ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
					}`}
					title={isSnappingEnabled ? "Snapping Enabled (N)" : "Snapping Disabled (N)"}
				>
					<HugeiconsIcon icon={MagnetIcon} size={16} />
				</button>
				<div className="w-px h-6 bg-border" />
				<div className="flex items-center gap-1">
					<button
						onClick={onUndo}
						disabled={!canUndo}
						className={`p-1.5 rounded ${
							canUndo ? "text-muted-foreground hover:bg-accent hover:text-foreground" : "text-muted-foreground/40 cursor-not-allowed"
						}`}
						title="Undo (Ctrl+Z)"
					>
						<HugeiconsIcon icon={Undo02Icon} size={16} />
					</button>
					<button
						onClick={onRedo}
						disabled={!canRedo}
						className={`p-1.5 rounded ${
							canRedo ? "text-muted-foreground hover:bg-accent hover:text-foreground" : "text-muted-foreground/40 cursor-not-allowed"
						}`}
						title="Redo (Ctrl+Y)"
					>
						<HugeiconsIcon icon={Redo02Icon} size={16} />
					</button>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<div className="flex items-center gap-1">
					<button onClick={onZoomOut} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground" title="Zoom out">
						<HugeiconsIcon icon={SearchMinusIcon} size={16} />
					</button>
					<span className="text-xs text-muted-foreground w-12 text-center">{Math.round((pixelsPerSecond / 50) * 100)}%</span>
					<button onClick={onZoomIn} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground" title="Zoom in">
						<HugeiconsIcon icon={SearchAddIcon} size={16} />
					</button>
				</div>
			</div>
		</div>
	);
}

export default memo(TimelineToolbar);
