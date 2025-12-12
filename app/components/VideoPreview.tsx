"use client";

import { useRef, useEffect } from "react";
import { TimelineState, VideoClip, AudioClip } from "../types/timeline";
import * as Tone from "tone";

interface VideoPreviewProps {
	timelineState: TimelineState | null;
	currentTime: number;
	currentTimeRef: React.MutableRefObject<number>;
	isPlaying: boolean;
	onPlayPause: () => void;
}

interface AudioNodes {
	element: HTMLAudioElement;
	source: MediaElementAudioSourceNode;
	gain: Tone.Gain;
	pitchShift: Tone.PitchShift;
	pan: Tone.Panner;
}

const audioSourcesMap = new WeakMap<HTMLAudioElement, boolean>();

export default function VideoPreview({ timelineState, currentTime, currentTimeRef, isPlaying, onPlayPause }: VideoPreviewProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
	const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
	const audioNodesRef = useRef<Map<string, AudioNodes>>(new Map());
	const audioContextRef = useRef<AudioContext | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const audioPlayPromisesRef = useRef<Map<string, Promise<void>>>(new Map());

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
		const newAudioElements = new Map<string, HTMLAudioElement>();
		const newAudioNodes = new Map<string, AudioNodes>();

		// Create video elements
		timelineState.tracks.forEach((track) => {
			if (track.type === "video") {
				track.clips.forEach((clip) => {
					const videoClip = clip as VideoClip;
					let videoEl = videoElementsRef.current.get(videoClip.id);
					if (!videoEl) {
						videoEl = document.createElement("video");
						videoEl.src = videoClip.src;
						videoEl.preload = "auto";
						videoEl.muted = true; // mute to avoid audio conflict. ideally we'd wanna extract it into an audio clip, but this will be too disruptive to the user experience when multiplayer.
						videoEl.playsInline = true;
					}
					newVideoElements.set(videoClip.id, videoEl);
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
						nodes.gain.gain.rampTo(audioClip.properties.volume, 0.001);
						nodes.pan.pan.rampTo(audioClip.properties.pan, 0.001);
						nodes.pitchShift.pitch = audioClip.properties.pitch;
						nodes.element.playbackRate = Math.max(0.25, Math.min(4, audioClip.properties.speed));
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

			const activeVideoClips: { clip: VideoClip; trackIndex: number }[] = [];
			timelineState.tracks.forEach((track, trackIndex) => {
				if (track.type === "video") {
					track.clips.forEach((clip) => {
						const videoClip = clip as VideoClip;
						const clipEnd = videoClip.startTime + videoClip.duration;
						if (currentTimeValue >= videoClip.startTime && currentTimeValue < clipEnd) {
							activeVideoClips.push({ clip: videoClip, trackIndex });
						}
					});
				}
			});

			activeVideoClips.sort((a, b) => b.trackIndex - a.trackIndex);

			// Render each active video clip
			for (const { clip } of activeVideoClips) {
				const videoEl = videoElementsRef.current.get(clip.id);
				if (!videoEl) continue;

				const timeInClip = currentTimeValue - clip.startTime;
				const props = clip.properties;

				let internalTime: number;

				// speed
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

				const videoDuration = isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
				const clampMax = videoDuration > 0 ? Math.max(clip.duration, videoDuration) : clip.duration;

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
					const { zoom, rotation, pitch, yaw, flip, crop } = props;

					ctx.save();

					// center point for transformations
					const centerX = x + width / 2;
					const centerY = y + height / 2;

					ctx.translate(centerX, centerY);

					// rotation
					ctx.rotate((rotation * Math.PI) / 180);

					// flip
					const scaleX = flip.horizontal ? -1 : 1;
					const scaleY = flip.vertical ? -1 : 1;
					ctx.scale(scaleX * zoom.x, scaleY * zoom.y);

					// pitch & yaw
					const pitchRad = (pitch * Math.PI) / 180;
					const yawRad = (yaw * Math.PI) / 180;

					const pitchScale = Math.cos(pitchRad);
					const yawScale = Math.cos(yawRad);

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

					const finalWidth = croppedDestWidth * yawScale;
					const finalHeight = croppedDestHeight * pitchScale;

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

			const activeVideoIds = new Set(activeVideoClips.map(({ clip }) => clip.id));
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

	return (
		<div className="h-full bg-[#1a1a1a] flex flex-col">
			<div className="flex-1 flex items-center justify-center p-4">
				<div className="relative" style={{ maxWidth: "100%", maxHeight: "100%" }}>
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
				</div>
			</div>
		</div>
	);
}
