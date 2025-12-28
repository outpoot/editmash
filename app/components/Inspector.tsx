"use client";

import { useState, useEffect, useMemo } from "react";
import { Clip, VideoClip, ImageClip, AudioClip, VideoClipProperties, AudioClipProperties } from "../types/timeline";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowDown01Icon,
	ArrowRight01Icon,
	Link01Icon,
	LinkSquare01Icon,
	FlipHorizontalIcon,
	FlipVerticalIcon,
} from "@hugeicons/core-free-icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import DragNumberInput from "./DragNumberInput";
import { useMatchWebSocketOptional } from "./MatchWS";

const DEFAULT_VIDEO_PROPERTIES: VideoClipProperties = {
	position: { x: 0, y: 0 },
	size: { width: 1920, height: 1080 },
	zoom: { x: 1, y: 1, linked: true },
	rotation: 0,
	flip: { horizontal: false, vertical: false },
	crop: { left: 0, right: 0, top: 0, bottom: 0, softness: 0 },
	speed: 1,
	freezeFrame: false,
	freezeFrameTime: 0,
};

const DEFAULT_AUDIO_PROPERTIES: AudioClipProperties = {
	volume: 1,
	pan: 0,
	pitch: 0,
	speed: 1,
};

interface InspectorProps {
	selectedClips: { clip: Clip; trackId: string }[] | null;
	onClipUpdate?: (trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<ImageClip> | Partial<AudioClip>) => void;
	currentTime: number;
}

export default function Inspector({ selectedClips, onClipUpdate, currentTime }: InspectorProps) {
	const [transformExpanded, setTransformExpanded] = useState(true);
	const [croppingExpanded, setCroppingExpanded] = useState(true);
	const [speedExpanded, setSpeedExpanded] = useState(true);
	const [audioExpanded, setAudioExpanded] = useState(true);
	const [activeTab, setActiveTab] = useState<string>("video");

	const matchWs = useMatchWebSocketOptional();
	const audioMaxDb = matchWs?.matchConfig?.audioMaxDb ?? 30;

	const clip = selectedClips?.[selectedClips.length - 1]?.clip;
	const trackId = selectedClips?.[selectedClips.length - 1]?.trackId;

	const video = useMemo(() => {
		if (!clip || (clip.type !== "video" && clip.type !== "image")) return DEFAULT_VIDEO_PROPERTIES;
		const props = clip.properties as Partial<VideoClipProperties>;
		return {
			position: props.position ?? DEFAULT_VIDEO_PROPERTIES.position,
			size: props.size ?? DEFAULT_VIDEO_PROPERTIES.size,
			zoom: props.zoom ?? DEFAULT_VIDEO_PROPERTIES.zoom,
			rotation: props.rotation ?? DEFAULT_VIDEO_PROPERTIES.rotation,
			flip: props.flip ?? DEFAULT_VIDEO_PROPERTIES.flip,
			crop: props.crop ?? DEFAULT_VIDEO_PROPERTIES.crop,
			speed: props.speed ?? DEFAULT_VIDEO_PROPERTIES.speed,
			freezeFrame: props.freezeFrame ?? DEFAULT_VIDEO_PROPERTIES.freezeFrame,
			freezeFrameTime: props.freezeFrameTime ?? DEFAULT_VIDEO_PROPERTIES.freezeFrameTime,
		};
	}, [clip]);

	const audio = useMemo(() => {
		if (!clip || clip.type !== "audio") return DEFAULT_AUDIO_PROPERTIES;
		const props = clip.properties as Partial<AudioClipProperties>;
		return {
			volume: props.volume ?? DEFAULT_AUDIO_PROPERTIES.volume,
			pan: props.pan ?? DEFAULT_AUDIO_PROPERTIES.pan,
			pitch: props.pitch ?? DEFAULT_AUDIO_PROPERTIES.pitch,
			speed: props.speed ?? DEFAULT_AUDIO_PROPERTIES.speed,
		};
	}, [clip]);

	useEffect(() => {
		if (clip?.type === "video" || clip?.type === "image") {
			setActiveTab("video");
		} else if (clip?.type === "audio") {
			setActiveTab("audio");
		}
	}, [clip?.type, clip?.id]);

	if (!selectedClips || selectedClips.length === 0) {
		return (
			<div className="h-full bg-card border-l border-border flex items-center justify-center">
				<p className="text-sm text-muted-foreground">No clip selected</p>
			</div>
		);
	}

	const handlePropertyUpdate = (updates: Partial<VideoClip> | Partial<ImageClip> | Partial<AudioClip>) => {
		if (onClipUpdate && clip && trackId) {
			onClipUpdate(trackId, clip.id, updates);
		}
	};

	const handleAudioPropertyUpdate = (updates: Partial<AudioClip>) => {
		if (onClipUpdate && clip?.type === "audio" && trackId) {
			onClipUpdate(trackId, clip.id, updates);
		}
	};

	const updateVideoProperty = (propertyUpdate: Partial<VideoClipProperties>) => {
		if (clip && (clip.type === "video" || clip.type === "image") && trackId) {
			handlePropertyUpdate({
				properties: {
					...clip.properties,
					...propertyUpdate,
				},
			});
		}
	};

	const updateAudioProperty = (propertyUpdate: Partial<AudioClipProperties>) => {
		if (clip && clip.type === "audio" && trackId) {
			handleAudioPropertyUpdate({
				properties: {
					...clip.properties,
					...propertyUpdate,
				},
			});
		}
	};

	const isVideoClip = clip && (clip.type === "video" || clip.type === "image") && "properties" in clip;
	const isAudioClip = clip && clip.type === "audio" && "properties" in clip;

	return (
		<div className="h-full bg-card border-l border-border flex flex-col">
			<Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
				<TabsList className="w-full grid grid-cols-3 rounded-none border-b border-border bg-transparent h-auto p-0">
					<TabsTrigger
						value="video"
						disabled={!clip || (clip.type !== "video" && clip.type !== "image")}
						className="rounded-none text-secondary-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary disabled:opacity-50 disabled:cursor-not-allowed py-2"
					>
						Video
					</TabsTrigger>
					<TabsTrigger
						value="audio"
						disabled={!clip || clip.type !== "audio"}
						className="rounded-none text-secondary-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary disabled:opacity-50 disabled:cursor-not-allowed py-2"
					>
						Audio
					</TabsTrigger>
					<TabsTrigger
						value="info"
						className="rounded-none text-secondary-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary py-2"
					>
						Info
					</TabsTrigger>
				</TabsList>

				<div className="flex-1 overflow-y-auto">
					<TabsContent value="video" className="p-3 space-y-2 mt-0">
						{isVideoClip ? (
							<>
								<div className="border border-border rounded">
									<div
										role="button"
										tabIndex={0}
										onClick={() => setTransformExpanded(!transformExpanded)}
										onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setTransformExpanded(!transformExpanded)}
										className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent"
									>
										{transformExpanded ? (
											<HugeiconsIcon icon={ArrowDown01Icon} size={14} />
										) : (
											<HugeiconsIcon icon={ArrowRight01Icon} size={14} />
										)}
										<span>TRANSFORM</span>
									</div>

									{transformExpanded && (
										<div className="px-3 pb-2 space-y-2 border-t border-border">
											{/* Zoom */}
											{clip && (clip.type === "video" || clip.type === "image") && (
												<div className="pt-2 flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Zoom</Label>
													<span className="text-muted-foreground/60 text-xs">X</span>
													<DragNumberInput
														value={video.zoom.x}
														onChange={(newValue) => {
															updateVideoProperty({
																zoom: {
																	...video.zoom,
																	x: newValue,
																	y: video.zoom.linked ? newValue : video.zoom.y,
																},
															});
														}}
														step={0.01}
														min={0.1}
														max={10}
														className="w-14"
													/>
													<button
														onClick={() => {
															updateVideoProperty({
																zoom: {
																	...video.zoom,
																	linked: !video.zoom.linked,
																},
															});
														}}
														className={`p-1 rounded ${video.zoom.linked ? "text-primary" : "text-muted-foreground"} hover:bg-muted`}
													>
														{video.zoom.linked ? (
															<HugeiconsIcon icon={Link01Icon} size={14} />
														) : (
															<HugeiconsIcon icon={LinkSquare01Icon} size={14} />
														)}
													</button>
													<span className="text-muted-foreground/60 text-xs">Y</span>
													<DragNumberInput
														value={video.zoom.y}
														onChange={(newValue) => {
															updateVideoProperty({
																zoom: {
																	...video.zoom,
																	y: newValue,
																	x: video.zoom.linked ? newValue : video.zoom.x,
																},
															});
														}}
														step={0.01}
														min={0.1}
														max={10}
														className="w-14"
													/>
												</div>
											)}

											{/* Position */}
											{clip && (clip.type === "video" || clip.type === "image") && (
												<div className="flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Position</Label>
													<span className="text-muted-foreground/60 text-xs">X</span>
													<DragNumberInput
														value={video.position.x}
														onChange={(newValue) => {
															updateVideoProperty({
																position: {
																	...video.position,
																	x: newValue,
																},
															});
														}}
														step={1}
														className="w-14"
													/>
													<span className="text-muted-foreground/60 text-xs">Y</span>
													<DragNumberInput
														value={video.position.y}
														onChange={(newValue) => {
															updateVideoProperty({
																position: {
																	...video.position,
																	y: newValue,
																},
															});
														}}
														step={1}
														className="w-14"
													/>
												</div>
											)}

											{/* Rotation Angle */}
											{clip && (clip.type === "video" || clip.type === "image") && (
												<div className="flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Rotation</Label>
													<Slider
														value={[video.rotation]}
														onValueChange={([value]) => {
															updateVideoProperty({ rotation: value });
														}}
														min={-180}
														max={180}
														step={0.1}
														className="flex-1"
													/>
													<DragNumberInput
														value={video.rotation}
														onChange={(newValue) => {
															updateVideoProperty({ rotation: newValue });
														}}
														min={-180}
														max={180}
														step={0.1}
														className="w-14"
													/>
												</div>
											)}

											{/* Flip */}
											{clip && (clip.type === "video" || clip.type === "image") && (
												<div className="flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Flip</Label>
													<button
														onClick={() => {
															updateVideoProperty({
																flip: {
																	...video.flip,
																	horizontal: !video.flip.horizontal,
																},
															});
														}}
														className={`p-2 rounded border ${
															video.flip.horizontal
																? "bg-primary/20 border-primary text-primary"
																: "border-border text-muted-foreground hover:bg-muted"
														}`}
														title="Flip Horizontal"
													>
														<HugeiconsIcon icon={FlipHorizontalIcon} size={16} />
													</button>
													<button
														onClick={() => {
															updateVideoProperty({
																flip: {
																	...video.flip,
																	vertical: !video.flip.vertical,
																},
															});
														}}
														className={`p-2 rounded border ${
															video.flip.vertical
																? "bg-primary/20 border-primary text-primary"
																: "border-border text-muted-foreground hover:bg-muted"
														}`}
														title="Flip Vertical"
													>
														<HugeiconsIcon icon={FlipVerticalIcon} size={16} />
													</button>
												</div>
											)}
										</div>
									)}
								</div>

								{/* Cropping Panel */}
								<div className="border border-border rounded">
									<div
										role="button"
										tabIndex={0}
										onClick={() => setCroppingExpanded(!croppingExpanded)}
										onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setCroppingExpanded(!croppingExpanded)}
										className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent"
									>
										{croppingExpanded ? (
											<HugeiconsIcon icon={ArrowDown01Icon} size={14} />
										) : (
											<HugeiconsIcon icon={ArrowRight01Icon} size={14} />
										)}
										<span>CROPPING</span>
									</div>

									{croppingExpanded && (
										<div className="px-3 pb-2 space-y-2 border-t border-border">
											{/* Crop Left */}
											{clip && (clip.type === "video" || clip.type === "image") && (
												<div className="pt-2 flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Left</Label>
													<Slider
														value={[video.crop.left]}
														onValueChange={([value]) => {
															updateVideoProperty({
																crop: {
																	...video.crop,
																	left: value,
																},
															});
														}}
														min={0}
														max={1920}
														step={1}
														className="flex-1"
													/>
													<DragNumberInput
														value={video.crop.left}
														onChange={(newValue) => {
															updateVideoProperty({
																crop: {
																	...video.crop,
																	left: Math.max(0, newValue),
																},
															});
														}}
														min={0}
														max={1920}
														step={1}
														className="w-14"
													/>
												</div>
											)}

											{/* Crop Right */}
											{clip && (clip.type === "video" || clip.type === "image") && (
												<div className="flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Right</Label>
													<Slider
														value={[video.crop.right]}
														onValueChange={([value]) => {
															updateVideoProperty({
																crop: {
																	...video.crop,
																	right: value,
																},
															});
														}}
														min={0}
														max={1920}
														step={1}
														className="flex-1"
													/>
													<DragNumberInput
														value={video.crop.right}
														onChange={(newValue) => {
															updateVideoProperty({
																crop: {
																	...video.crop,
																	right: Math.max(0, newValue),
																},
															});
														}}
														min={0}
														max={1920}
														step={1}
														className="w-14"
													/>
												</div>
											)}

											{/* Crop Top */}
											{clip && (clip.type === "video" || clip.type === "image") && (
												<div className="flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Top</Label>
													<Slider
														value={[video.crop.top]}
														onValueChange={([value]) => {
															updateVideoProperty({
																crop: {
																	...video.crop,
																	top: value,
																},
															});
														}}
														min={0}
														max={1080}
														step={1}
														className="flex-1"
													/>
													<DragNumberInput
														value={video.crop.top}
														onChange={(newValue) => {
															updateVideoProperty({
																crop: {
																	...video.crop,
																	top: Math.max(0, newValue),
																},
															});
														}}
														min={0}
														max={1080}
														step={1}
														className="w-14"
													/>
												</div>
											)}

											{/* Crop Bottom */}
											{clip && (clip.type === "video" || clip.type === "image") && (
												<div className="flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Bottom</Label>
													<Slider
														value={[video.crop.bottom]}
														onValueChange={([value]) => {
															updateVideoProperty({
																crop: {
																	...video.crop,
																	bottom: value,
																},
															});
														}}
														min={0}
														max={1080}
														step={1}
														className="flex-1"
													/>
													<DragNumberInput
														value={video.crop.bottom}
														onChange={(newValue) => {
															updateVideoProperty({
																crop: {
																	...video.crop,
																	bottom: Math.max(0, newValue),
																},
															});
														}}
														min={0}
														max={1080}
														step={1}
														className="w-14"
													/>
												</div>
											)}
										</div>
									)}
								</div>

								{/* Speed Panel */}
								<div className="border border-border rounded">
									<div
										role="button"
										tabIndex={0}
										onClick={() => setSpeedExpanded(!speedExpanded)}
										onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSpeedExpanded(!speedExpanded)}
										className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent"
									>
										{speedExpanded ? (
											<HugeiconsIcon icon={ArrowDown01Icon} size={14} />
										) : (
											<HugeiconsIcon icon={ArrowRight01Icon} size={14} />
										)}
										<span>SPEED</span>
									</div>

									{speedExpanded && (
										<div className="px-3 pb-2 space-y-2 border-t border-border">
											{/* Speed */}
											{clip && (clip.type === "video" || clip.type === "image") && (
												<div className="pt-2 flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Speed</Label>
													<DragNumberInput
														value={video.speed * 100}
														onChange={(newValue) => {
															const newSpeed = newValue / 100;
															const oldSpeed = video.speed;
															const sourceDuration = clip.duration * oldSpeed;
															const newDuration = sourceDuration / newSpeed;

															if (onClipUpdate && trackId) {
																onClipUpdate(trackId, clip.id, {
																	duration: newDuration,
																	properties: {
																		...video,
																		speed: newSpeed,
																	},
																});
															}
														}}
														min={10}
														max={1000}
														step={1}
														className="flex-1"
													/>
													<span className="text-muted-foreground/60 text-xs">%</span>
												</div>
											)}

											{/* Freeze Frame */}
											{clip && (clip.type === "video" || clip.type === "image") && (
												<div className="flex items-center gap-2">
													<Label className="text-muted-foreground text-xs flex-1">Freeze Frame</Label>
													<Checkbox
														checked={video.freezeFrame}
														onCheckedChange={(checked) => {
															const freezeTime = Math.max(0, currentTime - clip.startTime);
															updateVideoProperty({
																freezeFrame: checked === true,
																freezeFrameTime: checked === true ? freezeTime : 0,
															});
														}}
													/>
												</div>
											)}
										</div>
									)}
								</div>
							</>
						) : (
							<p className="text-sm text-muted-foreground">Select a video clip to edit properties</p>
						)}
					</TabsContent>

					<TabsContent value="audio" className="p-3 space-y-2 mt-0">
						{isAudioClip ? (
							<>
								<div className="border border-border rounded">
									<div
										role="button"
										tabIndex={0}
										onClick={() => setAudioExpanded(!audioExpanded)}
										onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setAudioExpanded(!audioExpanded)}
										className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
									>
										{audioExpanded ? (
											<HugeiconsIcon icon={ArrowDown01Icon} size={14} />
										) : (
											<HugeiconsIcon icon={ArrowRight01Icon} size={14} />
										)}
										<span>AUDIO</span>
									</div>

									{audioExpanded && (
										<div className="px-3 pb-2 space-y-2 border-t border-border">
											{clip && clip.type === "audio" && (
												<div className="pt-2 flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Volume</Label>
													<Slider
														value={[audio.volume <= 0 ? -60 : 20 * Math.log10(audio.volume)]}
														onValueChange={([value]) => {
															const clampedDb = Math.min(value, audioMaxDb);
															const linearVolume = clampedDb <= -60 ? 0 : Math.pow(10, clampedDb / 20);
															updateAudioProperty({
																volume: Math.max(0, linearVolume),
															});
														}}
														min={-60}
														max={audioMaxDb}
														step={1}
														className="flex-1"
													/>
													<DragNumberInput
														value={audio.volume <= 0 ? -60.0 : Number((20 * Math.log10(audio.volume)).toFixed(1))}
														onChange={(newValue) => {
															const clampedDb = Math.min(newValue, audioMaxDb);
															const linearVolume = clampedDb <= -60 ? 0 : Math.pow(10, clampedDb / 20);
															updateAudioProperty({
																volume: Math.max(0, linearVolume),
															});
														}}
														min={-60}
														max={audioMaxDb}
														step={0.1}
														className="w-14"
													/>
													<span className="text-muted-foreground/60 text-xs">dB</span>
												</div>
											)}

											{/* Pan */}
											{clip && clip.type === "audio" && (
												<div className="flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Pan</Label>
													<Slider
														value={[audio.pan * 100]}
														onValueChange={([value]) => {
															updateAudioProperty({ pan: value / 100 });
														}}
														min={-100}
														max={100}
														step={1}
														className="flex-1"
													/>
													<DragNumberInput
														value={Number((audio.pan * 100).toFixed(1))}
														onChange={(newValue) => {
															updateAudioProperty({ pan: newValue / 100 });
														}}
														min={-100}
														max={100}
														step={0.1}
														className="w-14"
													/>
												</div>
											)}

											{/* Pitch */}
											{clip && clip.type === "audio" && (
												<div className="flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Pitch</Label>
													<Slider
														value={[audio.pitch]}
														onValueChange={([value]) => {
															updateAudioProperty({ pitch: value });
														}}
														min={-24}
														max={24}
														step={1}
														className="flex-1"
													/>
													<DragNumberInput
														value={Number(audio.pitch.toFixed(1))}
														onChange={(newValue) => {
															updateAudioProperty({ pitch: Math.round(newValue) });
														}}
														min={-24}
														max={24}
														step={0.1}
														className="w-14"
													/>
													<span className="text-muted-foreground/60 text-xs">ST</span>
												</div>
											)}

											{clip && clip.type === "audio" && (
												<div className="flex items-center gap-2">
													<Label className="text-muted-foreground text-xs w-16 shrink-0">Speed</Label>
													<DragNumberInput
														value={Number((audio.speed * 100).toFixed(1))}
														onChange={(newValue) => {
															const newSpeed = newValue / 100;
															const oldSpeed = audio.speed;
															const sourceDuration = clip.duration * oldSpeed;
															const newDuration = sourceDuration / newSpeed;

															if (onClipUpdate && trackId) {
																onClipUpdate(trackId, clip.id, {
																	duration: newDuration,
																	properties: {
																		...audio,
																		speed: newSpeed,
																	},
																});
															}
														}}
														min={10}
														max={1000}
														step={0.1}
														className="flex-1"
													/>
													<span className="text-muted-foreground/60 text-xs">%</span>
												</div>
											)}
										</div>
									)}
								</div>
							</>
						) : (
							<p className="text-sm text-muted-foreground">Select an audio clip to edit properties</p>
						)}
					</TabsContent>

					<TabsContent value="info" className="p-4 space-y-4 mt-0">
						{clip && (
							<div>
								<h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Clip Info</h3>
								<div className="space-y-2 text-sm">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Type:</span>
										<span className="text-foreground capitalize">{clip.type}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Source:</span>
										<span className="text-foreground truncate ml-2">{clip.src.split("/").pop()}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Start Time:</span>
										<span className="text-foreground">{clip.startTime.toFixed(2)}s</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Duration:</span>
										<span className="text-foreground">{clip.duration.toFixed(2)}s</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">End Time:</span>
										<span className="text-foreground">{(clip.startTime + clip.duration).toFixed(2)}s</span>
									</div>
								</div>
							</div>
						)}
					</TabsContent>
				</div>
			</Tabs>
		</div>
	);
}
