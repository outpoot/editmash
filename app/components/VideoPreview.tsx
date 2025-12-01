"use client";

import { useRef, useEffect } from "react";
import { TimelineState, VideoClip, AudioClip } from "../types/timeline";

interface VideoPreviewProps {
	timelineState: TimelineState | null;
	currentTime: number;
	currentTimeRef: React.MutableRefObject<number>;
	isPlaying: boolean;
	onPlayPause: () => void;
}

export default function VideoPreview({
	timelineState,
	currentTime,
	currentTimeRef,
	isPlaying,
	onPlayPause,
}: VideoPreviewProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
	const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
	const animationFrameRef = useRef<number | null>(null);

	const CANVAS_WIDTH = 1920;
	const CANVAS_HEIGHT = 1080;

	useEffect(() => {
		if (!timelineState) return;

		const newVideoElements = new Map<string, HTMLVideoElement>();
		const newAudioElements = new Map<string, HTMLAudioElement>();

		// Create video elements
		timelineState.tracks.forEach((track) => {
			if (track.type === "video") {
				track.clips.forEach((clip) => {
					const videoClip = clip as VideoClip;
					// Reuse existing element if available
					let videoEl = videoElementsRef.current.get(videoClip.id);
					if (!videoEl) {
						videoEl = document.createElement("video");
						videoEl.src = videoClip.src;
						videoEl.preload = "auto";
						videoEl.muted = true; // mute to avoid audio conflict. ideally we'd wanna extract it into an audio clip, but this will be too disruptive to the user experience. 
						videoEl.playsInline = true;
					}
					newVideoElements.set(videoClip.id, videoEl);
				});
			} else if (track.type === "audio") {
				track.clips.forEach((clip) => {
					const audioClip = clip as AudioClip;
					// Reuse existing element if available
					let audioEl = audioElementsRef.current.get(audioClip.id);
					if (!audioEl) {
						audioEl = document.createElement("audio");
						audioEl.src = audioClip.src;
						audioEl.preload = "auto";
						audioEl.volume = audioClip.properties.volume;
					} else {
						audioEl.volume = audioClip.properties.volume;
					}
					newAudioElements.set(audioClip.id, audioEl);
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
		audioElementsRef.current.forEach((audio, id) => {
			if (!newAudioElements.has(id)) {
				audio.pause();
				audio.src = "";
				audio.load();
			}
		});

		videoElementsRef.current = newVideoElements;
		audioElementsRef.current = newAudioElements;

		return () => {
			videoElementsRef.current.forEach((video) => {
				video.pause();
			});
			audioElementsRef.current.forEach((audio) => {
				audio.pause();
			});
		};
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

				const internalTime = currentTimeValue - clip.startTime;

				if (Math.abs(videoEl.currentTime - internalTime) > 0.1) {
					try {
						videoEl.currentTime = internalTime;
					} catch (err) {
						console.error("Error seeking video:", err);
					}
				}

				try {
					const { x, y } = clip.properties.position;
					const { width, height } = clip.properties.size;
					ctx.drawImage(videoEl, x, y, width, height);
				} catch (err) {
					// Video might not be loaded yet
				}
			}

			// Handle audio tracks
			timelineState.tracks.forEach((track) => {
				if (track.type === "audio") {
					track.clips.forEach((clip) => {
						const audioClip = clip as AudioClip;
						const audioEl = audioElementsRef.current.get(audioClip.id);
						if (!audioEl) return;

						const clipEnd = audioClip.startTime + audioClip.duration;
						const isActive = currentTimeValue >= audioClip.startTime && currentTimeValue < clipEnd;

						if (isActive) {
							const internalTime = currentTimeValue - audioClip.startTime;

							if (Math.abs(audioEl.currentTime - internalTime) > 0.1) {
								try {
									audioEl.currentTime = internalTime;
								} catch (err) {
									console.error("Error seeking audio:", err);
								}
							}

							if (isPlaying && audioEl.paused) {
								audioEl.play().catch((err) => console.error("Error playing audio:", err));
							} else if (!isPlaying && !audioEl.paused) {
								audioEl.pause();
							}
						} else {
							if (!audioEl.paused) {
								audioEl.pause();
							}
						}
					});
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
