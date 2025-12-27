"use client";

import { useRef, useEffect, useState } from "react";
import { TimelineState, VideoClip, ImageClip, AudioClip, Clip } from "../types/timeline";
import * as Tone from "tone";

interface VideoPreviewProps {
	timelineState: TimelineState | null;
	currentTime: number;
	currentTimeRef: React.RefObject<number>;
	isPlaying: boolean;
	onPlayPause: () => void;
	transformMode?: "transform" | "crop" | null;
	selectedClips?: { clip: Clip; trackId: string }[] | null;
	onClipUpdate?: (trackId: string, clipId: string, updates: Partial<VideoClip> | Partial<AudioClip>) => void;
}

interface AudioNodes {
	element: HTMLAudioElement;
	source: MediaElementAudioSourceNode;
	gain: Tone.Gain;
	pitchShift: Tone.PitchShift;
	pan: Tone.Panner;
}

const audioSourcesMap = new WeakMap<HTMLAudioElement, boolean>();

export default function VideoPreview({
	timelineState,
	currentTime,
	currentTimeRef,
	isPlaying,
	onPlayPause,
	transformMode,
	selectedClips,
	onClipUpdate,
}: VideoPreviewProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
	const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map());
	const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
	const audioNodesRef = useRef<Map<string, AudioNodes>>(new Map());
	const audioContextRef = useRef<AudioContext | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const audioPlayPromisesRef = useRef<Map<string, Promise<void>>>(new Map());

	const [isDragging, setIsDragging] = useState(false);
	const [dragType, setDragType] = useState<"move" | "resize" | "crop" | null>(null);
	const [dragHandle, setDragHandle] = useState<"nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w" | null>(null);

	const CANVAS_WIDTH = 1920;
	const CANVAS_HEIGHT = 1080;

	useEffect(() => {
		if (!timelineState) return;

		if (!audioContextRef.current) {
			if (Tone.context.state === "suspended") {
				Tone.context.resume().catch(() => {});
			}
			audioContextRef.current = Tone.context.rawContext as AudioContext;
		}

		const newVideoElements = new Map<string, HTMLVideoElement>();
		const newImageElements = new Map<string, HTMLImageElement>();
		const newAudioElements = new Map<string, HTMLAudioElement>();
		const newAudioNodes = new Map<string, AudioNodes>();

		// Create video elements
		timelineState.tracks.forEach((track) => {
			if (track.type === "video") {
				track.clips.forEach((clip) => {
					if (clip.type === "video") {
						const videoClip = clip as VideoClip;
						let videoEl = videoElementsRef.current.get(videoClip.id);
						if (!videoEl) {
							videoEl = document.createElement("video");
							videoEl.src = videoClip.src;
							videoEl.preload = "auto";
							videoEl.muted = true; // mute to avoid audio conflict. ideally we'd wanna extract it into an audio clip, but this will be too disruptive to the user experience when multiplayer.
							videoEl.playsInline = true;
							videoEl.crossOrigin = "anonymous";
						}
						newVideoElements.set(videoClip.id, videoEl);
					} else if (clip.type === "image") {
						const imageClip = clip as ImageClip;
						let imgEl = imageElementsRef.current.get(imageClip.id);
						if (!imgEl) {
							imgEl = document.createElement("img");
							imgEl.src = imageClip.src;
							imgEl.crossOrigin = "anonymous";
						}
						newImageElements.set(imageClip.id, imgEl);
					}
				});
			} else if (track.type === "audio") {
				track.clips.forEach((clip) => {
					const audioClip = clip as AudioClip;
					let nodes = audioNodesRef.current.get(audioClip.id);

					const needsNewNodes = !nodes || nodes.gain.disposed || nodes.pitchShift.disposed || nodes.pan.disposed;

					if (needsNewNodes) {
						if (nodes) {
							nodes.source.disconnect();
							audioSourcesMap.delete(nodes.element);
						}

						const audioEl = document.createElement("audio");
						audioEl.src = audioClip.src;
						audioEl.preload = "auto";
						audioEl.volume = 1.0;
						audioEl.crossOrigin = "anonymous";

						if (audioSourcesMap.has(audioEl)) {
							console.warn("Audio element already has a source node, skipping");
							return;
						}

						const rawContext = Tone.context.rawContext as AudioContext;

						if (rawContext.state === "closed") {
							console.error("AudioContext is closed, cannot create audio source");
							return;
						}

						const source = rawContext.createMediaElementSource(audioEl);
						audioSourcesMap.set(audioEl, true);

						const gain = new Tone.Gain(audioClip.properties.volume);
						const pitchShift = new Tone.PitchShift(audioClip.properties.pitch);
						const pan = new Tone.Panner(audioClip.properties.pan);

						source.connect(gain.input);
						gain.connect(pitchShift);
						pitchShift.connect(pan);
						pan.toDestination();

						nodes = { element: audioEl, source, gain, pitchShift, pan };
					}

					if (nodes) {
						newAudioElements.set(audioClip.id, nodes.element);
						newAudioNodes.set(audioClip.id, nodes);
					}
				});
			}
		});

		// Clean up elements that are no longer in the timeline
		videoElementsRef.current.forEach((video, id) => {
			if (!newVideoElements.has(id)) {
				video.pause();
				video.src = "";
				video.load();
			}
		});
		imageElementsRef.current.forEach((img, id) => {
			if (!newImageElements.has(id)) {
				img.src = "";
			}
		});
		audioNodesRef.current.forEach((nodes, id) => {
			if (!newAudioNodes.has(id)) {
				nodes.element.pause();
				nodes.source.disconnect();
				if (!nodes.gain.disposed) nodes.gain.dispose();
				if (!nodes.pitchShift.disposed) nodes.pitchShift.dispose();
				if (!nodes.pan.disposed) nodes.pan.dispose();
				audioSourcesMap.delete(nodes.element);
				nodes.element.src = "";
				nodes.element.load();
			}
		});

		videoElementsRef.current = newVideoElements;
		imageElementsRef.current = newImageElements;
		audioElementsRef.current = newAudioElements;
		audioNodesRef.current = newAudioNodes;

		return () => {
			videoElementsRef.current.forEach((video) => {
				video.pause();
			});
			audioNodesRef.current.forEach((nodes) => {
				const cleanupNodes = () => {
					nodes.element.pause();
					nodes.source.disconnect();
					if (!nodes.gain.disposed) nodes.gain.dispose();
					if (!nodes.pitchShift.disposed) nodes.pitchShift.dispose();
					if (!nodes.pan.disposed) nodes.pan.dispose();
					audioSourcesMap.delete(nodes.element);
				};

				const playPromise = audioPlayPromisesRef.current.get(nodes.element.src);
				if (playPromise) {
					playPromise.finally(cleanupNodes);
				} else {
					cleanupNodes();
				}
			});
			audioPlayPromisesRef.current.clear();
		};
	}, [timelineState]);

	useEffect(() => {
		if (!timelineState || !audioContextRef.current) return;

		timelineState.tracks.forEach((track) => {
			if (track.type === "audio") {
				track.clips.forEach((clip) => {
					const audioClip = clip as AudioClip;
					const nodes = audioNodesRef.current.get(audioClip.id);
					if (nodes && !nodes.gain.disposed && !nodes.pitchShift.disposed && !nodes.pan.disposed) {
						nodes.gain.gain.rampTo(audioClip.properties.volume ?? 1, 0.001);
						nodes.pan.pan.rampTo(audioClip.properties.pan ?? 0, 0.001);
						nodes.pitchShift.pitch = audioClip.properties.pitch ?? 0;
						nodes.element.playbackRate = Math.max(0.25, Math.min(4, audioClip.properties.speed ?? 1));
					}
				});
			}
		});
	}, [timelineState]);

	useEffect(() => {
		if (!timelineState || !canvasRef.current) return;

		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const renderFrame = () => {
			const currentTimeValue = currentTimeRef.current;

			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

			const activeVideoClips: { clip: VideoClip | ImageClip; trackIndex: number }[] = [];
			timelineState.tracks.forEach((track, trackIndex) => {
				if (track.type === "video") {
					track.clips.forEach((clip) => {
						if (clip.type === "video" || clip.type === "image") {
							const visualClip = clip as VideoClip | ImageClip;
							const clipEnd = visualClip.startTime + visualClip.duration;
							if (currentTimeValue >= visualClip.startTime && currentTimeValue < clipEnd) {
								activeVideoClips.push({ clip: visualClip, trackIndex });
							}
						}
					});
				}
			});

			activeVideoClips.sort((a, b) => b.trackIndex - a.trackIndex);

			// Render each active video clip
			for (const { clip } of activeVideoClips) {
				if (clip.type === "image") {
					const imgEl = imageElementsRef.current.get(clip.id);
					if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) continue;
					const props = clip.properties;

					try {
						const { x, y } = props.position;
						const { width, height } = props.size;
						const { zoom, rotation, flip, crop } = props;

						ctx.save();

						// center point for transformations
						const centerX = x + width / 2;
						const centerY = y + height / 2;

						ctx.translate(centerX, centerY);

						// rotation
						ctx.rotate((rotation * Math.PI) / 180);

						// flip and zoom
						const flipX = flip.horizontal ? -1 : 1;
						const flipY = flip.vertical ? -1 : 1;

						const scaleX = flipX * zoom.x;
						const scaleY = flipY * zoom.y;

						ctx.scale(scaleX, scaleY);

						// crop
						const sourceX = crop.left;
						const sourceY = crop.top;

						const origImgWidth = imgEl.naturalWidth;
						const origImgHeight = imgEl.naturalHeight;

						const iw = origImgWidth > 0 ? origImgWidth : 1;
						const ih = origImgHeight > 0 ? origImgHeight : 1;

						const sourceWidth = Math.max(0, iw - crop.left - crop.right);
						const sourceHeight = Math.max(0, ih - crop.top - crop.bottom);

						const cropWidthRatio = sourceWidth / iw;
						const cropHeightRatio = sourceHeight / ih;

						const croppedDestWidth = width * cropWidthRatio;
						const croppedDestHeight = height * cropHeightRatio;

						const finalWidth = croppedDestWidth;
						const finalHeight = croppedDestHeight;

						const cropOffsetX = (width * (crop.left - crop.right)) / (2 * iw);
						const cropOffsetY = (height * (crop.top - crop.bottom)) / (2 * ih);

						const drawX = -finalWidth / 2 + cropOffsetX;
						const drawY = -finalHeight / 2 + cropOffsetY;

						if (sourceWidth > 0 && sourceHeight > 0) {
							ctx.drawImage(imgEl, sourceX, sourceY, sourceWidth, sourceHeight, drawX, drawY, finalWidth, finalHeight);
						}

						ctx.restore();
					} catch (err) {
						console.error("Error rendering image frame:", err);
					}
				} else {
					const videoEl = videoElementsRef.current.get(clip.id);
					if (!videoEl) continue;

					const timeInClip = currentTimeValue - clip.startTime;
					const props = clip.properties;

					let internalTime: number;

					// speed
					const videoDuration = isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
					const clampMax = videoDuration > 0 ? Math.max(clip.duration, videoDuration) : clip.duration;

					if (props.freezeFrame) {
						internalTime = clip.sourceIn + props.freezeFrameTime;
						if (!videoEl.paused) {
							videoEl.pause();
						}
						if (Math.abs(videoEl.currentTime - internalTime) > 0.1) {
							videoEl.currentTime = Math.max(0, Math.min(internalTime, videoDuration));
						}
					} else {
						internalTime = clip.sourceIn + timeInClip * props.speed;
					}

					internalTime = Math.max(0, Math.min(internalTime, clampMax));

					if (!props.freezeFrame) {
						videoEl.playbackRate = Math.max(0.25, Math.min(4, props.speed));

						if (isPlaying && videoEl.paused) {
							if (Math.abs(videoEl.currentTime - internalTime) > 0.1) {
								videoEl.currentTime = Math.max(0, Math.min(internalTime, clampMax));
							}
							videoEl.play().catch((err) => {
								if (err.name !== "AbortError") {
									console.error("Error playing video:", err);
								}
							});
						} else if (!isPlaying && !videoEl.paused) {
							videoEl.pause();
						} else if (!isPlaying) {
							if (Math.abs(videoEl.currentTime - internalTime) > 0.1) {
								videoEl.currentTime = Math.max(0, Math.min(internalTime, clampMax));
							}
						}
					}

					// transformations & crop
					try {
						const { x, y } = props.position;
						const { width, height } = props.size;
						const { zoom, rotation, flip, crop } = props;

						ctx.save();

						// center point for transformations
						const centerX = x + width / 2;
						const centerY = y + height / 2;

						ctx.translate(centerX, centerY);

						// rotation
						ctx.rotate((rotation * Math.PI) / 180);

						// flip and zoom
						const flipX = flip.horizontal ? -1 : 1;
						const flipY = flip.vertical ? -1 : 1;

						const scaleX = flipX * zoom.x;
						const scaleY = flipY * zoom.y;

						ctx.scale(scaleX, scaleY);

						// crop
						const sourceX = crop.left;
						const sourceY = crop.top;

						const origVideoWidth = videoEl.videoWidth;
						const origVideoHeight = videoEl.videoHeight;

						const vw = origVideoWidth > 0 ? origVideoWidth : 1;
						const vh = origVideoHeight > 0 ? origVideoHeight : 1;

						const sourceWidth = Math.max(0, vw - crop.left - crop.right);
						const sourceHeight = Math.max(0, vh - crop.top - crop.bottom);

						const cropWidthRatio = sourceWidth / vw;
						const cropHeightRatio = sourceHeight / vh;

						const croppedDestWidth = width * cropWidthRatio;
						const croppedDestHeight = height * cropHeightRatio;

						const finalWidth = croppedDestWidth;
						const finalHeight = croppedDestHeight;

						const cropOffsetX = (width * (crop.left - crop.right)) / (2 * vw);
						const cropOffsetY = (height * (crop.top - crop.bottom)) / (2 * vh);

						const drawX = -finalWidth / 2 + cropOffsetX;
						const drawY = -finalHeight / 2 + cropOffsetY;

						// original video dimensions are not available yet, skip drawing
						if (origVideoWidth <= 0 || origVideoHeight <= 0) {
							ctx.restore();
							continue;
						}

						if (sourceWidth > 0 && sourceHeight > 0) {
							ctx.drawImage(videoEl, sourceX, sourceY, sourceWidth, sourceHeight, drawX, drawY, finalWidth, finalHeight);
						}

						ctx.restore();
					} catch (err) {
						console.error("Error rendering video frame:", err);
					}
				}
			}

			// Render audio tracks
			timelineState.tracks.forEach((track) => {
				if (track.type === "audio") {
					track.clips.forEach((clip) => {
						const audioClip = clip as AudioClip;
						const audioEl = audioElementsRef.current.get(audioClip.id);
						if (!audioEl) return;

						const clipEnd = audioClip.startTime + audioClip.duration;
						const isActive = currentTimeValue >= audioClip.startTime && currentTimeValue < clipEnd;

						if (isActive) {
							const timeInClip = currentTimeValue - audioClip.startTime;
							const internalTime = audioClip.sourceIn + timeInClip * audioClip.properties.speed;

							if (Math.abs(audioEl.currentTime - internalTime) > 0.1) {
								audioEl.currentTime = internalTime;
							}

							if (isPlaying && audioEl.paused) {
								if (Tone.context.state === "suspended") {
									Tone.start();
								}

								const playPromise = audioEl.play();
								if (playPromise !== undefined) {
									audioPlayPromisesRef.current.set(audioClip.id, playPromise);
									playPromise
										.then(() => {
											audioPlayPromisesRef.current.delete(audioClip.id);
										})
										.catch((err) => {
											audioPlayPromisesRef.current.delete(audioClip.id);
											if (err.name !== "AbortError") {
												console.error("Error playing audio:", err);
											}
										});
								}
							} else if (!isPlaying && !audioEl.paused) {
								const playPromise = audioPlayPromisesRef.current.get(audioClip.id);
								if (playPromise) {
									playPromise.finally(() => {
										if (!audioEl.paused) {
											audioEl.pause();
										}
									});
								} else {
									audioEl.pause();
								}
							}
						} else {
							if (!audioEl.paused) {
								const playPromise = audioPlayPromisesRef.current.get(audioClip.id);
								if (playPromise) {
									playPromise.finally(() => {
										if (!audioEl.paused) {
											audioEl.pause();
										}
									});
								} else {
									audioEl.pause();
								}
							}
						}
					});
				}
			});

			const activeVideoIds = new Set(activeVideoClips.filter(({ clip }) => clip.type === "video").map(({ clip }) => clip.id));
			videoElementsRef.current.forEach((video, id) => {
				if (!activeVideoIds.has(id) && !video.paused) {
					video.pause();
				}
			});

			if (!isPlaying) {
				videoElementsRef.current.forEach((video) => {
					if (!video.paused) {
						video.pause();
					}
				});
			}

			animationFrameRef.current = requestAnimationFrame(renderFrame);
		};

		animationFrameRef.current = requestAnimationFrame(renderFrame);

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [timelineState, isPlaying, currentTimeRef]);

	const selectedVideoClip =
		selectedClips && selectedClips.length === 1 && (selectedClips[0].clip.type === "video" || selectedClips[0].clip.type === "image")
			? (selectedClips[0] as { clip: VideoClip | ImageClip; trackId: string })
			: null;

	const getDisplayRect = (clip: VideoClip | ImageClip) => {
		if (!canvasRef.current || !containerRef.current) return null;

		const canvas = canvasRef.current;
		const canvasRect = canvas.getBoundingClientRect();

		const displayScale = canvasRect.width / CANVAS_WIDTH;

		const props = clip.properties;
		const { position, size, zoom, crop } = props;

		const baseWidth = size.width;
		const baseHeight = size.height;

		let canvasX, canvasY, canvasWidth, canvasHeight;

		if (transformMode === "crop") {
			let sourceMediaWidth = 1920;
			let sourceMediaHeight = 1080;

			if (clip.type === "video") {
				const videoEl = videoElementsRef.current.get(clip.id);
				sourceMediaWidth = videoEl?.videoWidth || 1920;
				sourceMediaHeight = videoEl?.videoHeight || 1080;
			} else {
				const imgEl = imageElementsRef.current.get(clip.id);
				sourceMediaWidth = imgEl?.naturalWidth || 1920;
				sourceMediaHeight = imgEl?.naturalHeight || 1080;
			}

			const sourceWidth = sourceMediaWidth - crop.left - crop.right;
			const sourceHeight = sourceMediaHeight - crop.top - crop.bottom;

			const cropWidthRatio = sourceWidth / sourceMediaWidth;
			const cropHeightRatio = sourceHeight / sourceMediaHeight;

			const visibleBaseWidth = baseWidth * cropWidthRatio;
			const visibleBaseHeight = baseHeight * cropHeightRatio;

			canvasWidth = visibleBaseWidth * zoom.x;
			canvasHeight = visibleBaseHeight * zoom.y;

			const centerX = position.x + baseWidth / 2;
			const centerY = position.y + baseHeight / 2;

			const cropOffsetX = (baseWidth * (crop.left - crop.right)) / (2 * sourceMediaWidth);
			const cropOffsetY = (baseHeight * (crop.top - crop.bottom)) / (2 * sourceMediaHeight);

			canvasX = centerX - canvasWidth / 2 + cropOffsetX * zoom.x;
			canvasY = centerY - canvasHeight / 2 + cropOffsetY * zoom.y;
		} else {
			const centerX = position.x + baseWidth / 2;
			const centerY = position.y + baseHeight / 2;

			canvasWidth = baseWidth * zoom.x;
			canvasHeight = baseHeight * zoom.y;

			canvasX = centerX - canvasWidth / 2;
			canvasY = centerY - canvasHeight / 2;
		}

		const result = {
			x: canvasX * displayScale,
			y: canvasY * displayScale,
			width: canvasWidth * displayScale,
			height: canvasHeight * displayScale,
			scaleX: displayScale,
			scaleY: displayScale,
		};

		return result;
	};

	const handleTransformMouseDown = (e: React.MouseEvent, type: "move" | "resize" | "crop", handle?: typeof dragHandle) => {
		if (!selectedVideoClip || !onClipUpdate) return;

		e.preventDefault();
		e.stopPropagation();

		setIsDragging(true);
		setDragType(type);
		if (handle) setDragHandle(handle);

		const startX = e.clientX;
		const startY = e.clientY;
		const clip = selectedVideoClip.clip;
		const startProps = { ...clip.properties };

		const handleMouseMove = (moveEvent: MouseEvent) => {
			if (!canvasRef.current || !selectedVideoClip) return;

			const currentClip = selectedVideoClip.clip;
			const currentProps = currentClip.properties as typeof startProps;

			const canvasRect = canvasRef.current.getBoundingClientRect();
			const scaleX = CANVAS_WIDTH / canvasRect.width;
			const scaleY = CANVAS_HEIGHT / canvasRect.height;

			const deltaX = (moveEvent.clientX - startX) * scaleX;
			const deltaY = (moveEvent.clientY - startY) * scaleY;

			if (type === "move") {
				const newX = startProps.position.x + deltaX;
				const newY = startProps.position.y + deltaY;

				onClipUpdate(selectedVideoClip.trackId, clip.id, {
					properties: {
						...currentProps,
						position: { x: newX, y: newY },
					},
				});
			} else if (type === "resize" && handle) {
				let newZoomX = currentProps.zoom.x;
				let newZoomY = currentProps.zoom.y;

				const currentRenderedWidth = currentProps.size.width * currentProps.zoom.x;
				const currentRenderedHeight = currentProps.size.height * currentProps.zoom.y;

				const isCorner = handle.length === 2; // "nw", "ne", "sw", "se"
				const isEdge = handle.length === 1; // "n", "e", "s", "w"

				let newRenderedWidth = currentRenderedWidth;
				let newRenderedHeight = currentRenderedHeight;

				if (handle.includes("e")) {
					newRenderedWidth = Math.max(50, currentRenderedWidth + deltaX);
				}
				if (handle.includes("w")) {
					newRenderedWidth = Math.max(50, currentRenderedWidth - deltaX);
				}
				if (handle.includes("s")) {
					newRenderedHeight = Math.max(50, currentRenderedHeight + deltaY);
				}
				if (handle.includes("n")) {
					newRenderedHeight = Math.max(50, currentRenderedHeight - deltaY);
				}

				const calculatedZoomX = newRenderedWidth / currentProps.size.width;
				const calculatedZoomY = newRenderedHeight / currentProps.size.height;

				if (isCorner) {
					const avgZoom = (calculatedZoomX + calculatedZoomY) / 2;
					newZoomX = avgZoom;
					newZoomY = avgZoom;
				} else if (isEdge) {
					if (handle === "e" || handle === "w") {
						newZoomX = calculatedZoomX;
						newZoomY = currentProps.zoom.y;
					} else if (handle === "n" || handle === "s") {
						newZoomX = currentProps.zoom.x;
						newZoomY = calculatedZoomY;
					}
				}

				newZoomX = Math.max(0.1, Math.min(10, newZoomX));
				newZoomY = Math.max(0.1, Math.min(10, newZoomY));

				onClipUpdate(selectedVideoClip.trackId, clip.id, {
					properties: {
						...currentProps,
						zoom: { x: newZoomX, y: newZoomY, linked: currentProps.zoom.linked },
					},
				});
			} else if (type === "crop" && handle) {
				let mediaWidth = 1920;
				let mediaHeight = 1080;

				if (selectedVideoClip.clip.type === "video") {
					const videoEl = videoElementsRef.current.get(selectedVideoClip.clip.id);
					mediaWidth = videoEl?.videoWidth || 1920;
					mediaHeight = videoEl?.videoHeight || 1080;
				} else if (selectedVideoClip.clip.type === "image") {
					const imgEl = imageElementsRef.current.get(selectedVideoClip.clip.id);
					mediaWidth = imgEl?.naturalWidth || 1920;
					mediaHeight = imgEl?.naturalHeight || 1080;
				}

				let newCrop = { ...currentProps.crop };

				if (handle.includes("w")) {
					newCrop.left = Math.min(mediaWidth - startProps.crop.right, Math.max(0, startProps.crop.left + deltaX));
				}
				if (handle.includes("e")) {
					newCrop.right = Math.min(mediaWidth - startProps.crop.left, Math.max(0, startProps.crop.right - deltaX));
				}
				if (handle.includes("n")) {
					newCrop.top = Math.min(mediaHeight - startProps.crop.bottom, Math.max(0, startProps.crop.top + deltaY));
				}
				if (handle.includes("s")) {
					newCrop.bottom = Math.min(mediaHeight - startProps.crop.top, Math.max(0, startProps.crop.bottom - deltaY));
				}

				onClipUpdate(selectedVideoClip.trackId, clip.id, {
					properties: {
						...currentProps,
						crop: newCrop,
					},
				});
			}
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			setDragType(null);
			setDragHandle(null);
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
	};

	const displayRect = selectedVideoClip && transformMode ? getDisplayRect(selectedVideoClip.clip) : null;

	return (
		<div className="h-full bg-background flex flex-col">
			<div className="flex-1 flex items-center justify-center p-4">
				<div ref={containerRef} className="relative" style={{ maxWidth: "100%", maxHeight: "100%" }}>
					<canvas
						ref={canvasRef}
						width={CANVAS_WIDTH}
						height={CANVAS_HEIGHT}
						className="w-full h-full bg-black"
						style={{
							maxWidth: "100%",
							maxHeight: "100%",
							aspectRatio: "16/9",
						}}
					/>

					{/* Transform overlay */}
					{displayRect && selectedVideoClip && transformMode && (
						<div
							className="absolute border-2 border-primary pointer-events-none"
							style={{
								left: `${displayRect.x}px`,
								top: `${displayRect.y}px`,
								width: `${displayRect.width}px`,
								height: `${displayRect.height}px`,
							}}
						>
							{/* Center circle for moving */}
							<div
								className="absolute bg-primary rounded-full pointer-events-auto cursor-move"
								style={{
									width: "12px",
									height: "12px",
									left: "50%",
									top: "50%",
									transform: "translate(-50%, -50%)",
								}}
								onMouseDown={(e) => handleTransformMouseDown(e, "move")}
							/>

							{/* Corner handles */}
							{["nw", "ne", "sw", "se"].map((handle) => (
								<div
									key={handle}
									className="absolute bg-white border-2 border-primary pointer-events-auto"
									style={{
										width: "8px",
										height: "8px",
										...(handle.includes("n") ? { top: "-4px" } : { bottom: "-4px" }),
										...(handle.includes("w") ? { left: "-4px" } : { right: "-4px" }),
										cursor: `${handle}-resize`,
									}}
									onMouseDown={(e) => handleTransformMouseDown(e, transformMode === "crop" ? "crop" : "resize", handle as any)}
								/>
							))}

							{/* Edge handles */}
							{["n", "e", "s", "w"].map((handle) => (
								<div
									key={handle}
									className="absolute bg-white border-2 border-primary pointer-events-auto"
									style={{
										width: handle === "n" || handle === "s" ? "8px" : "2px",
										height: handle === "e" || handle === "w" ? "8px" : "2px",
										...(handle === "n" && { top: "-4px", left: "50%", transform: "translateX(-50%)" }),
										...(handle === "s" && { bottom: "-4px", left: "50%", transform: "translateX(-50%)" }),
										...(handle === "e" && { right: "-4px", top: "50%", transform: "translateY(-50%)" }),
										...(handle === "w" && { left: "-4px", top: "50%", transform: "translateY(-50%)" }),
										cursor: `${handle}-resize`,
									}}
									onMouseDown={(e) => handleTransformMouseDown(e, transformMode === "crop" ? "crop" : "resize", handle as any)}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
