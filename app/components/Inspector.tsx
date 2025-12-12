"use client";

import { useState, useEffect } from "react";
import { Clip, VideoClip, AudioClip, VideoClipProperties, AudioClipProperties } from "../types/timeline";
import { ChevronDown, ChevronRight, Link2, Link2Off, RotateCcw, FlipHorizontal, FlipVertical } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import DragNumberInput from "./DragNumberInput";

interface InspectorProps {
	selectedClips: { clip: Clip; trackId: string }[] | null;
	onClipUpdate?: (trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<AudioClip>) => void;
	currentTime: number;
}

export default function Inspector({ selectedClips, onClipUpdate, currentTime }: InspectorProps) {
	const [transformExpanded, setTransformExpanded] = useState(true);
	const [croppingExpanded, setCroppingExpanded] = useState(true);
	const [speedExpanded, setSpeedExpanded] = useState(true);
	const [audioExpanded, setAudioExpanded] = useState(true);
	const [activeTab, setActiveTab] = useState<string>("video");

	const clip = selectedClips?.[selectedClips.length - 1]?.clip;
	const trackId = selectedClips?.[selectedClips.length - 1]?.trackId;

	useEffect(() => {
		if (clip?.type === "video") {
			setActiveTab("video");
		} else if (clip?.type === "audio") {
			setActiveTab("audio");
		}
	}, [clip?.type, clip?.id]);

	if (!selectedClips || selectedClips.length === 0) {
		return (
			<div className="h-full bg-[#1e1e1e] border-l border-zinc-800 flex items-center justify-center">
				<p className="text-sm text-zinc-500">No clip selected</p>
			</div>
		);
	}

	const handlePropertyUpdate = (updates: Partial<VideoClip> | Partial<AudioClip>) => {
		if (onClipUpdate && clip && trackId) {
			onClipUpdate(trackId, clip.id, updates);
		}
	};

	const handleAudioPropertyUpdate = (updates: Partial<AudioClip>) => {
		if (onClipUpdate && clip?.type === "audio" && trackId) {
			onClipUpdate(trackId, clip.id, updates);
		}
	};

	const resetTransform = () => {
		if (clip && clip.type === "video") {
			handlePropertyUpdate({
				properties: {
					...clip.properties,
					zoom: { x: 1, y: 1, linked: true },
					rotation: 0,
					pitch: 0,
					yaw: 0,
					flip: { horizontal: false, vertical: false },
				},
			});
		}
	};

	const resetCropping = () => {
		if (clip && clip.type === "video") {
			handlePropertyUpdate({
				properties: {
					...clip.properties,
					crop: { left: 0, right: 0, top: 0, bottom: 0, softness: 0 },
				},
			});
		}
	};

	const resetSpeed = () => {
		if (clip && clip.type === "video") {
			handlePropertyUpdate({
				properties: {
					...clip.properties,
					speed: 1,
					freezeFrame: false,
					freezeFrameTime: 0,
				},
			});
		}
	};

	const resetAudio = () => {
		if (clip && clip.type === "audio") {
			handleAudioPropertyUpdate({
				properties: {
					...clip.properties,
					volume: 1,
					pan: 0,
					pitch: 0,
					speed: 1,
				},
			});
		}
	};

	const updateVideoProperty = (propertyUpdate: Partial<VideoClipProperties>) => {
		if (clip && clip.type === "video" && trackId) {
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

	const isVideoClip = clip && clip.type === "video" && "properties" in clip;
	const isAudioClip = clip && clip.type === "audio" && "properties" in clip;

	return (
		<div className="h-full bg-[#1e1e1e] border-l border-zinc-800 flex flex-col">
			<Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
				<TabsList className="w-full grid grid-cols-3 rounded-none border-b border-zinc-800 bg-transparent h-auto p-0">
					<TabsTrigger
						value="video"
						disabled={!clip || clip.type !== "video"}
						className="rounded-none text-zinc-200 data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-2"
					>
						Video
					</TabsTrigger>
					<TabsTrigger
						value="audio"
						disabled={!clip || clip.type !== "audio"}
						className="rounded-none text-zinc-200 data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-2"
					>
						Audio
					</TabsTrigger>
					<TabsTrigger
						value="info"
						className="rounded-none text-zinc-200 data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 py-2"
					>
						Info
					</TabsTrigger>
				</TabsList>

				<div className="flex-1 overflow-y-auto">
					<TabsContent value="video" className="p-3 space-y-2 mt-0">
						{isVideoClip ? (
							<>
								<div className="border border-zinc-800 rounded">
									<div
										role="button"
										tabIndex={0}
										onClick={() => setTransformExpanded(!transformExpanded)}
										onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setTransformExpanded(!transformExpanded)}
										className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
									>
										<div className="flex items-center gap-2">
											{transformExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
											<span>TRANSFORM</span>
										</div>
										<button
											onClick={(e) => {
												e.stopPropagation();
												resetTransform();
											}}
											className="p-1 hover:bg-zinc-700 rounded"
											title="Reset all transform properties"
										>
											<RotateCcw size={14} />
										</button>
									</div>

									{transformExpanded && (
										<div className="px-3 pb-2 space-y-2 border-t border-zinc-800">
											{/* Zoom */}
											{clip && clip.type === "video" && (
												<div className="pt-2 flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Zoom</Label>
													<span className="text-zinc-600 text-xs">X</span>
													<DragNumberInput
														value={clip.properties.zoom.x}
														onChange={(newValue) => {
															updateVideoProperty({
																zoom: {
																	...clip.properties.zoom,
																	x: newValue,
																	y: clip.properties.zoom.linked ? newValue : clip.properties.zoom.y,
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
																	...clip.properties.zoom,
																	linked: !clip.properties.zoom.linked,
																},
															});
														}}
														className={`p-1 rounded ${clip.properties.zoom.linked ? "text-blue-500" : "text-zinc-500"} hover:bg-zinc-800`}
													>
														{clip.properties.zoom.linked ? <Link2 size={14} /> : <Link2Off size={14} />}
													</button>
													<span className="text-zinc-600 text-xs">Y</span>
													<DragNumberInput
														value={clip.properties.zoom.y}
														onChange={(newValue) => {
															updateVideoProperty({
																zoom: {
																	...clip.properties.zoom,
																	y: newValue,
																	x: clip.properties.zoom.linked ? newValue : clip.properties.zoom.x,
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
											{clip && clip.type === "video" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Position</Label>
													<span className="text-zinc-600 text-xs">X</span>
													<DragNumberInput
														value={clip.properties.position.x}
														onChange={(newValue) => {
															updateVideoProperty({
																position: {
																	...clip.properties.position,
																	x: newValue,
																},
															});
														}}
														step={1}
														className="w-14"
													/>
													<span className="text-zinc-600 text-xs">Y</span>
													<DragNumberInput
														value={clip.properties.position.y}
														onChange={(newValue) => {
															updateVideoProperty({
																position: {
																	...clip.properties.position,
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
											{clip && clip.type === "video" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Rotation</Label>
													<Slider
														value={[clip.properties.rotation]}
														onValueChange={([value]) => {
															updateVideoProperty({ rotation: value });
														}}
														min={-180}
														max={180}
														step={0.1}
														className="flex-1"
													/>
													<DragNumberInput
														value={clip.properties.rotation}
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

											{/* Pitch */}
											{clip && clip.type === "video" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Pitch</Label>
													<Slider
														value={[clip.properties.pitch]}
														onValueChange={([value]) => {
															updateVideoProperty({ pitch: value });
														}}
														min={-90}
														max={90}
														step={0.001}
														className="flex-1"
													/>
													<DragNumberInput
														value={clip.properties.pitch}
														onChange={(newValue) => {
															updateVideoProperty({ pitch: newValue });
														}}
														min={-90}
														max={90}
														step={0.001}
														className="w-14"
													/>
												</div>
											)}

											{/* Yaw */}
											{clip && clip.type === "video" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Yaw</Label>
													<Slider
														value={[clip.properties.yaw]}
														onValueChange={([value]) => {
															updateVideoProperty({ yaw: value });
														}}
														min={-90}
														max={90}
														step={0.001}
														className="flex-1"
													/>
													<DragNumberInput
														value={clip.properties.yaw}
														onChange={(newValue) => {
															updateVideoProperty({ yaw: newValue });
														}}
														min={-90}
														max={90}
														step={0.001}
														className="w-14"
													/>
												</div>
											)}

											{/* Flip */}
											{clip && clip.type === "video" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Flip</Label>
													<button
														onClick={() => {
															updateVideoProperty({
																flip: {
																	...clip.properties.flip,
																	horizontal: !clip.properties.flip.horizontal,
																},
															});
														}}
														className={`p-2 rounded border ${
															clip.properties.flip.horizontal
																? "bg-blue-500/20 border-blue-500 text-blue-400"
																: "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
														}`}
														title="Flip Horizontal"
													>
														<FlipHorizontal size={16} />
													</button>
													<button
														onClick={() => {
															updateVideoProperty({
																flip: {
																	...clip.properties.flip,
																	vertical: !clip.properties.flip.vertical,
																},
															});
														}}
														className={`p-2 rounded border ${
															clip.properties.flip.vertical
																? "bg-blue-500/20 border-blue-500 text-blue-400"
																: "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
														}`}
														title="Flip Vertical"
													>
														<FlipVertical size={16} />
													</button>
												</div>
											)}
										</div>
									)}
								</div>

								{/* Cropping Panel */}
								<div className="border border-zinc-800 rounded">
									<div
										role="button"
										tabIndex={0}
										onClick={() => setCroppingExpanded(!croppingExpanded)}
										onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setCroppingExpanded(!croppingExpanded)}
										className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
									>
										<div className="flex items-center gap-2">
											{croppingExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
											<span>CROPPING</span>
										</div>
										<button
											onClick={(e) => {
												e.stopPropagation();
												resetCropping();
											}}
											className="p-1 hover:bg-zinc-700 rounded"
											title="Reset all cropping properties"
										>
											<RotateCcw size={14} />
										</button>
									</div>

									{croppingExpanded && (
										<div className="px-3 pb-2 space-y-2 border-t border-zinc-800">
											{/* Crop Left */}
											{clip && clip.type === "video" && (
												<div className="pt-2 flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Left</Label>
													<Slider
														value={[clip.properties.crop.left]}
														onValueChange={([value]) => {
															updateVideoProperty({
																crop: {
																	...clip.properties.crop,
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
														value={clip.properties.crop.left}
														onChange={(newValue) => {
															updateVideoProperty({
																crop: {
																	...clip.properties.crop,
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
											{clip && clip.type === "video" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Right</Label>
													<Slider
														value={[clip.properties.crop.right]}
														onValueChange={([value]) => {
															updateVideoProperty({
																crop: {
																	...clip.properties.crop,
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
														value={clip.properties.crop.right}
														onChange={(newValue) => {
															updateVideoProperty({
																crop: {
																	...clip.properties.crop,
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
											{clip && clip.type === "video" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Top</Label>
													<Slider
														value={[clip.properties.crop.top]}
														onValueChange={([value]) => {
															updateVideoProperty({
																crop: {
																	...clip.properties.crop,
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
														value={clip.properties.crop.top}
														onChange={(newValue) => {
															updateVideoProperty({
																crop: {
																	...clip.properties.crop,
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
											{clip && clip.type === "video" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Bottom</Label>
													<Slider
														value={[clip.properties.crop.bottom]}
														onValueChange={([value]) => {
															updateVideoProperty({
																crop: {
																	...clip.properties.crop,
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
														value={clip.properties.crop.bottom}
														onChange={(newValue) => {
															updateVideoProperty({
																crop: {
																	...clip.properties.crop,
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
								<div className="border border-zinc-800 rounded">
									<div
										role="button"
										tabIndex={0}
										onClick={() => setSpeedExpanded(!speedExpanded)}
										onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSpeedExpanded(!speedExpanded)}
										className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
									>
										<div className="flex items-center gap-2">
											{speedExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
											<span>SPEED</span>
										</div>
										<button
											onClick={(e) => {
												e.stopPropagation();
												resetSpeed();
											}}
											className="p-1 hover:bg-zinc-700 rounded"
											title="Reset all speed properties"
										>
											<RotateCcw size={14} />
										</button>
									</div>

									{speedExpanded && (
										<div className="px-3 pb-2 space-y-2 border-t border-zinc-800">
											{/* Speed */}
											{clip && clip.type === "video" && (
												<div className="pt-2 flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Speed</Label>
													<DragNumberInput
														value={clip.properties.speed * 100}
														onChange={(newValue) => {
															const newSpeed = newValue / 100;
															const oldSpeed = clip.properties.speed;
															const sourceDuration = clip.duration * oldSpeed;
															const newDuration = sourceDuration / newSpeed;

															if (onClipUpdate && trackId) {
																onClipUpdate(trackId, clip.id, {
																	duration: newDuration,
																	properties: {
																		...clip.properties,
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
													<span className="text-zinc-600 text-xs">%</span>
												</div>
											)}

											{/* Freeze Frame */}
											{clip && clip.type === "video" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs flex-1">Freeze Frame</Label>
													<Checkbox
														checked={clip.properties.freezeFrame}
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
							<p className="text-sm text-zinc-500">Select a video clip to edit properties</p>
						)}
					</TabsContent>

					<TabsContent value="audio" className="p-3 space-y-2 mt-0">
						{isAudioClip ? (
							<>
								<div className="border border-zinc-800 rounded">
									<div
										role="button"
										tabIndex={0}
										onClick={() => setAudioExpanded(!audioExpanded)}
										onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setAudioExpanded(!audioExpanded)}
										className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
									>
										<div className="flex items-center gap-2">
											{audioExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
											<span>AUDIO</span>
										</div>
										<button
											onClick={(e) => {
												e.stopPropagation();
												resetAudio();
											}}
											className="p-1 hover:bg-zinc-700 rounded"
											title="Reset all audio properties"
										>
											<RotateCcw size={14} />
										</button>
									</div>

									{audioExpanded && (
										<div className="px-3 pb-2 space-y-2 border-t border-zinc-800">
											{clip && clip.type === "audio" && (
												<div className="pt-2 flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Volume</Label>
													<Slider
														value={[clip.properties.volume <= 0 ? -60 : 20 * Math.log10(clip.properties.volume)]}
														onValueChange={([value]) => {
															const linearVolume = value <= -60 ? 0 : Math.pow(10, value / 20);
															updateAudioProperty({
																volume: Math.max(0, Math.min(31.62, linearVolume)),
															});
														}}
														min={-60}
														max={30}
														step={1}
														className="flex-1"
													/>
													<DragNumberInput
														value={clip.properties.volume <= 0 ? -60.0 : Number((20 * Math.log10(clip.properties.volume)).toFixed(1))}
														onChange={(newValue) => {
															const linearVolume = newValue <= -60 ? 0 : Math.pow(10, newValue / 20);
															updateAudioProperty({
																volume: Math.max(0, Math.min(31.62, linearVolume)),
															});
														}}
														min={-60}
														max={30}
														step={0.1}
														className="w-14"
													/>
													<span className="text-zinc-600 text-xs">dB</span>
												</div>
											)}

											{/* Pan */}
											{clip && clip.type === "audio" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Pan</Label>
													<Slider
														value={[clip.properties.pan * 100]}
														onValueChange={([value]) => {
															updateAudioProperty({ pan: value / 100 });
														}}
														min={-100}
														max={100}
														step={1}
														className="flex-1"
													/>
													<DragNumberInput
														value={Number((clip.properties.pan * 100).toFixed(1))}
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
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Pitch</Label>
													<Slider
														value={[clip.properties.pitch]}
														onValueChange={([value]) => {
															updateAudioProperty({ pitch: value });
														}}
														min={-24}
														max={24}
														step={1}
														className="flex-1"
													/>
													<DragNumberInput
														value={Number(clip.properties.pitch.toFixed(1))}
														onChange={(newValue) => {
															updateAudioProperty({ pitch: Math.round(newValue) });
														}}
														min={-24}
														max={24}
														step={0.1}
														className="w-14"
													/>
													<span className="text-zinc-600 text-xs">ST</span>
												</div>
											)}

											{clip && clip.type === "audio" && (
												<div className="flex items-center gap-2">
													<Label className="text-zinc-500 text-xs w-16 flex-shrink-0">Speed</Label>
													<DragNumberInput
														value={Number((clip.properties.speed * 100).toFixed(1))}
														onChange={(newValue) => {
															const newSpeed = newValue / 100;
															const oldSpeed = clip.properties.speed;
															const sourceDuration = clip.duration * oldSpeed;
															const newDuration = sourceDuration / newSpeed;

															if (onClipUpdate && trackId) {
																onClipUpdate(trackId, clip.id, {
																	duration: newDuration,
																	properties: {
																		...clip.properties,
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
													<span className="text-zinc-600 text-xs">%</span>
												</div>
											)}
										</div>
									)}
								</div>
							</>
						) : (
							<p className="text-sm text-zinc-500">Select an audio clip to edit properties</p>
						)}
					</TabsContent>

					<TabsContent value="info" className="p-4 space-y-4 mt-0">
						{clip && (
							<div>
								<h3 className="text-xs font-semibold text-zinc-400 uppercase mb-2">Clip Info</h3>
								<div className="space-y-2 text-sm">
									<div className="flex justify-between">
										<span className="text-zinc-500">Type:</span>
										<span className="text-zinc-200 capitalize">{clip.type}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-zinc-500">Source:</span>
										<span className="text-zinc-200 truncate ml-2">{clip.src.split("/").pop()}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-zinc-500">Start Time:</span>
										<span className="text-zinc-200">{clip.startTime.toFixed(2)}s</span>
									</div>
									<div className="flex justify-between">
										<span className="text-zinc-500">Duration:</span>
										<span className="text-zinc-200">{clip.duration.toFixed(2)}s</span>
									</div>
									<div className="flex justify-between">
										<span className="text-zinc-500">End Time:</span>
										<span className="text-zinc-200">{(clip.startTime + clip.duration).toFixed(2)}s</span>
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
