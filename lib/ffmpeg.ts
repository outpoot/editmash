import ffmpeg from "fluent-ffmpeg";
import { TimelineState, VideoClip, ImageClip, AudioClip, Track } from "../app/types/timeline";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";

const getFFmpegPath = (): string => {
	const platform = process.platform;
	let possiblePaths: string[] = [];

	if (platform === "win32") {
		// Windows
		possiblePaths = [
			"C:\\Program Files\\FFmpeg\\bin\\ffmpeg.exe",
			"C:\\Program Files\\ShareX\\ffmpeg.exe",
			"C:\\ffmpeg\\bin\\ffmpeg.exe",
			"C:\\ffmpeg\\ffmpeg.exe",
			path.join(os.homedir(), "ffmpeg", "bin", "ffmpeg.exe"),
			path.join(os.homedir(), "ffmpeg", "ffmpeg.exe"),
		];
	} else if (platform === "darwin") {
		// macOS
		possiblePaths = [
			"/opt/homebrew/bin/ffmpeg",
			"/usr/local/bin/ffmpeg",
			"/usr/bin/ffmpeg",
			path.join(os.homedir(), ".local", "bin", "ffmpeg"),
			path.join(os.homedir(), "bin", "ffmpeg"),
		];
	} else {
		// Linux
		possiblePaths = [
			"/usr/bin/ffmpeg",
			"/usr/local/bin/ffmpeg",
			"/snap/bin/ffmpeg",
			"/usr/bin/local/ffmpeg",
			path.join(os.homedir(), ".local", "bin", "ffmpeg"),
			path.join(os.homedir(), "bin", "ffmpeg"),
		];
	}

	for (const ffmpegPath of possiblePaths) {
		if (fsSync.existsSync(ffmpegPath)) {
			return ffmpegPath;
		}
	}

	return "ffmpeg";
};

let cachedFFmpegPath: string;

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

function normalizeProperties(props: any) {
	const isFlat = "x" in props || "width" in props || "zoomX" in props || "cropLeft" in props;

	if (isFlat) {
		return {
			position: {
				x: props.x ?? 0,
				y: props.y ?? 0,
			},
			size: {
				width: props.width ?? CANVAS_WIDTH,
				height: props.height ?? CANVAS_HEIGHT,
			},
			zoom: {
				x: props.zoomX ?? 1,
				y: props.zoomY ?? 1,
				linked: props.zoomLinked ?? true,
			},
			rotation: props.rotation ?? 0,
			flip: {
				horizontal: props.flipX ?? false,
				vertical: props.flipY ?? false,
			},
			crop: {
				left: props.cropLeft ?? 0,
				right: props.cropRight ?? 0,
				top: props.cropTop ?? 0,
				bottom: props.cropBottom ?? 0,
				softness: 0,
			},
			opacity: props.opacity ?? 1,
			speed: props.speed ?? 1,
			freezeFrame: props.freezeFrame ?? false,
			freezeFrameTime: props.freezeFrameTime ?? 0,
			volume: props.volume ?? 1,
			pan: props.pan ?? 0,
			pitch: props.pitch ?? 0,
		};
	} else {
		return {
			position: props.position ?? { x: 0, y: 0 },
			size: props.size ?? { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
			zoom: props.zoom ?? { x: 1, y: 1, linked: true },
			rotation: props.rotation ?? 0,
			flip: props.flip ?? { horizontal: false, vertical: false },
			crop: props.crop ?? { left: 0, right: 0, top: 0, bottom: 0, softness: 0 },
			opacity: props.opacity ?? 1,
			speed: props.speed ?? 1,
			freezeFrame: props.freezeFrame ?? false,
			freezeFrameTime: props.freezeFrameTime ?? 0,
			volume: props.volume ?? 1,
			pan: props.pan ?? 0,
			pitch: props.pitch ?? 0,
		};
	}
}

function generateVideoFilter(clip: VideoClip, inputIndex: number, outputLabel: string): string {
	const rawProps = clip.properties ?? {};
	const props = normalizeProperties(rawProps);
	const filters: string[] = [];

	const speed = Math.max(0.25, Math.min(4, props.speed));
	const crop = props.crop;
	const size = props.size;
	const zoom = props.zoom;
	const flip = props.flip;
	const rotation = props.rotation;
	const freezeFrame = props.freezeFrame;
	const freezeFrameTime = props.freezeFrameTime;

	const sourceEndTime = clip.sourceIn + clip.duration * speed;
	filters.push(`[${inputIndex}:v]trim=start=${clip.sourceIn}:end=${sourceEndTime},setpts=PTS-STARTPTS`);

	if (speed !== 1) {
		filters.push(`setpts=PTS/${speed}`);
	}

	if (freezeFrame) {
		const frameDuration = 1 / 30;
		const frameCount = Math.ceil(clip.duration * 30);
		filters.push(`trim=start=${freezeFrameTime}:duration=${frameDuration},setpts=PTS-STARTPTS`);
		filters.push(`loop=loop=${frameCount}:size=1:start=0,setpts=PTS-STARTPTS`);
	}

	const hasCrop = crop.left > 0 || crop.right > 0 || crop.top > 0 || crop.bottom > 0;
	if (hasCrop) {
		filters.push(`crop=iw-${crop.left}-${crop.right}:ih-${crop.top}-${crop.bottom}:${crop.left}:${crop.top}`);
	}

	let scaleExpr: string;
	if (hasCrop) {
		const targetW = size.width * zoom.x;
		const targetH = size.height * zoom.y;
		const cropW = crop.left + crop.right;
		const cropH = crop.top + crop.bottom;
		scaleExpr = `scale='trunc(${targetW}*iw/(iw+${cropW})/2)*2':'trunc(${targetH}*ih/(ih+${cropH})/2)*2':flags=lanczos`;
	} else {
		const finalWidth = Math.round(size.width * zoom.x);
		const finalHeight = Math.round(size.height * zoom.y);
		const evenWidth = Math.max(2, finalWidth % 2 === 0 ? finalWidth : finalWidth + 1);
		const evenHeight = Math.max(2, finalHeight % 2 === 0 ? finalHeight : finalHeight + 1);
		scaleExpr = `scale=${evenWidth}:${evenHeight}:flags=lanczos`;
	}
	filters.push(scaleExpr);

	if (rotation !== 0) {
		const radians = (rotation * Math.PI) / 180;
		filters.push(`format=rgba`);
		filters.push(`rotate=${radians}:c=none:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`);
	}

	if (flip.horizontal) {
		filters.push(`hflip`);
	}
	if (flip.vertical) {
		filters.push(`vflip`);
	}

	if (rotation === 0) {
		filters.push(`format=rgba`);
	}

	if (clip.startTime > 0) {
		filters.push(`setpts=PTS+${clip.startTime}/TB`);
	}

	return filters.join(",") + `[${outputLabel}]`;
}

function generateImageFilter(clip: ImageClip, inputIndex: number, outputLabel: string): string {
	const rawProps = clip.properties ?? {};
	const props = normalizeProperties(rawProps);
	const filters: string[] = [];

	const crop = props.crop;
	const size = props.size;
	const zoom = props.zoom;
	const flip = props.flip;
	const rotation = props.rotation;

	const frameCount = Math.ceil(clip.duration * 30);
	filters.push(`[${inputIndex}:v]loop=loop=${frameCount}:size=1:start=0,setpts=PTS-STARTPTS,fps=30`);

	const hasCrop = crop.left > 0 || crop.right > 0 || crop.top > 0 || crop.bottom > 0;
	if (hasCrop) {
		filters.push(`crop=iw-${crop.left}-${crop.right}:ih-${crop.top}-${crop.bottom}:${crop.left}:${crop.top}`);
	}

	let scaleExpr: string;
	if (hasCrop) {
		const targetW = size.width * zoom.x;
		const targetH = size.height * zoom.y;
		const cropW = crop.left + crop.right;
		const cropH = crop.top + crop.bottom;
		scaleExpr = `scale='trunc(${targetW}*iw/(iw+${cropW})/2)*2':'trunc(${targetH}*ih/(ih+${cropH})/2)*2':flags=lanczos`;
	} else {
		const finalWidth = Math.round(size.width * zoom.x);
		const finalHeight = Math.round(size.height * zoom.y);
		const evenWidth = Math.max(2, finalWidth % 2 === 0 ? finalWidth : finalWidth + 1);
		const evenHeight = Math.max(2, finalHeight % 2 === 0 ? finalHeight : finalHeight + 1);
		scaleExpr = `scale=${evenWidth}:${evenHeight}:flags=lanczos`;
	}
	filters.push(scaleExpr);

	if (rotation !== 0) {
		const radians = (rotation * Math.PI) / 180;
		filters.push(`format=rgba`);
		filters.push(`rotate=${radians}:c=none:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`);
	}

	if (flip.horizontal) {
		filters.push(`hflip`);
	}
	if (flip.vertical) {
		filters.push(`vflip`);
	}

	if (rotation === 0) {
		filters.push(`format=rgba`);
	}

	filters.push(`trim=duration=${clip.duration}`);

	if (clip.startTime > 0) {
		filters.push(`setpts=PTS+${clip.startTime}/TB`);
	}

	return filters.join(",") + `[${outputLabel}]`;
}

function generateAudioFilter(clip: AudioClip, inputIndex: number, outputLabel: string): string {
	const rawProps = clip.properties ?? {};
	const props = normalizeProperties(rawProps);
	const filters: string[] = [];

	const speed = Math.max(0.25, Math.min(4, props.speed));
	const volume = props.volume;
	const pan = props.pan;
	const pitch = props.pitch;

	const sourceEndTime = clip.sourceIn + clip.duration * speed;
	filters.push(`[${inputIndex}:a]atrim=start=${clip.sourceIn}:end=${sourceEndTime},asetpts=PTS-STARTPTS`);

	if (speed !== 1) {
		let remainingSpeed = speed;
		while (remainingSpeed > 2.0) {
			filters.push(`atempo=2.0`);
			remainingSpeed /= 2.0;
		}
		while (remainingSpeed < 0.5) {
			filters.push(`atempo=0.5`);
			remainingSpeed *= 2.0;
		}
		if (Math.abs(remainingSpeed - 1.0) > 0.001) {
			filters.push(`atempo=${remainingSpeed}`);
		}
	}

	if (pitch !== 0) {
		const pitchRatio = Math.pow(2, pitch / 12);
		const newRate = Math.round(48000 * pitchRatio);
		filters.push(`asetrate=${newRate}`);
		filters.push(`aresample=48000`);
		const tempoCompensation = 1 / pitchRatio;
		if (Math.abs(tempoCompensation - 1.0) > 0.001) {
			let remainingTempo = tempoCompensation;
			while (remainingTempo > 2.0) {
				filters.push(`atempo=2.0`);
				remainingTempo /= 2.0;
			}
			while (remainingTempo < 0.5) {
				filters.push(`atempo=0.5`);
				remainingTempo *= 2.0;
			}
			if (Math.abs(remainingTempo - 1.0) > 0.001) {
				filters.push(`atempo=${remainingTempo}`);
			}
		}
	}

	if (Math.abs(volume - 1) > 0.001) {
		filters.push(`volume=${volume}`);
	}

	if (Math.abs(pan) > 0.001) {
		const leftGain = pan <= 0 ? 1 : 1 - pan;
		const rightGain = pan >= 0 ? 1 : 1 + pan;
		filters.push(`pan=stereo|c0=${leftGain}*c0|c1=${rightGain}*c1`);
	}

	return filters.join(",") + `[${outputLabel}]`;
}

function calculateOverlayPosition(clip: VideoClip | ImageClip): { x: string; y: string } {
	const rawProps = clip.properties ?? {};
	const props = normalizeProperties(rawProps);

	const position = props.position;
	const size = props.size;
	const zoom = props.zoom;
	const crop = props.crop;

	const centerX = position.x + size.width / 2;
	const centerY = position.y + size.height / 2;

	const hasCropX = crop.left + crop.right > 0;
	const hasCropY = crop.top + crop.bottom > 0;
	const cropAsymmetryX = crop.left - crop.right;
	const cropAsymmetryY = crop.top - crop.bottom;

	let xExpr: string;
	if (hasCropX && cropAsymmetryX !== 0) {
		const targetW = size.width * zoom.x;
		const cropTotal = crop.left + crop.right;
		xExpr = `${centerX}-w/2+(${cropAsymmetryX})*(${targetW}-w)/(2*${cropTotal})`;
	} else {
		xExpr = `${centerX}-w/2`;
	}

	let yExpr: string;
	if (hasCropY && cropAsymmetryY !== 0) {
		const targetH = size.height * zoom.y;
		const cropTotal = crop.top + crop.bottom;
		yExpr = `${centerY}-h/2+(${cropAsymmetryY})*(${targetH}-h)/(2*${cropTotal})`;
	} else {
		yExpr = `${centerY}-h/2`;
	}

	return { x: xExpr, y: yExpr };
}

function buildComplexFilter(
	timeline: TimelineState,
	videoTracks: Track[],
	audioTracks: Track[],
	inputFileMap: Map<string, number>
): string {
	const filterChains: string[] = [];
	const duration = timeline.duration || 1;

	const videoOutputs: Array<{ label: string; clip: VideoClip | ImageClip; trackIndex: number }> = [];
	let videoLabelCounter = 0;

	videoTracks.forEach((track, trackIndex) => {
		track.clips.forEach((clip) => {
			if (clip.type === "video") {
				const videoClip = clip as VideoClip;
				const inputIndex = inputFileMap.get(videoClip.src);
				if (inputIndex === undefined) return;

				const label = `v${videoLabelCounter++}`;

				const filter = generateVideoFilter(videoClip, inputIndex, label);
				filterChains.push(filter);

				videoOutputs.push({ label, clip: videoClip, trackIndex });
			} else if (clip.type === "image") {
				const imageClip = clip as ImageClip;
				const inputIndex = inputFileMap.get(imageClip.src);
				if (inputIndex === undefined) return;

				const label = `v${videoLabelCounter++}`;

				const filter = generateImageFilter(imageClip, inputIndex, label);
				filterChains.push(filter);

				videoOutputs.push({ label, clip: imageClip, trackIndex });
			}
		});
	});

	const timelineSegments = videoOutputs;

	filterChains.push(`color=c=black:s=${CANVAS_WIDTH}x${CANVAS_HEIGHT}:d=${duration}:r=30[base]`);

	if (timelineSegments.length === 0) {
		filterChains.push(`[base]copy[vout]`);
	} else {
		timelineSegments.sort((a, b) => b.trackIndex - a.trackIndex);

		let currentBase = "base";
		timelineSegments.forEach((segment, idx) => {
			const { label, clip } = segment;
			const outputLabel = idx === timelineSegments.length - 1 ? "vout" : `overlay${idx}`;

			const { x, y } = calculateOverlayPosition(clip);

			const clipEndTime = clip.startTime + clip.duration;
			const enable = `between(t,${clip.startTime},${clipEndTime})`;

			const overlayFilter = `[${currentBase}][${label}]overlay=${x}:${y}:enable='${enable}'[${outputLabel}]`;
			filterChains.push(overlayFilter);
			currentBase = outputLabel;
		});
	}

	const audioOutputs: string[] = [];
	let audioLabelCounter = 0;

	audioTracks.forEach((track) => {
		track.clips.forEach((clip) => {
			const audioClip = clip as AudioClip;
			const inputIndex = inputFileMap.get(audioClip.src);
			if (inputIndex === undefined) return;

			const label = `a${audioLabelCounter++}`;

			const filter = generateAudioFilter(audioClip, inputIndex, label);
			filterChains.push(filter);

			if (audioClip.startTime > 0) {
				const delayLabel = `${label}_delayed`;
				filterChains.push(`[${label}]adelay=${audioClip.startTime * 1000}|${audioClip.startTime * 1000}[${delayLabel}]`);
				audioOutputs.push(delayLabel);
			} else {
				audioOutputs.push(label);
			}
		});
	});

	if (audioOutputs.length > 0) {
		const audioInputs = audioOutputs.map((label) => `[${label}]`).join("");
		filterChains.push(`${audioInputs}amix=inputs=${audioOutputs.length}:duration=longest[aout]`);
	} else {
		filterChains.push(`anullsrc=channel_layout=stereo:sample_rate=48000:d=${duration}[aout]`);
	}

	return filterChains.join(";");
}

export async function renderTimeline(
	timeline: TimelineState,
	mediaFiles: Map<string, string>,
	outputPath: string,
	onProgress?: (progress: number) => void
): Promise<void> {
	const videoTracks = timeline.tracks.filter((t) => t.type === "video");
	const audioTracks = timeline.tracks.filter((t) => t.type === "audio");

	const inputFileMap = new Map<string, number>();
	const inputFiles: string[] = [];
	let inputIndex = 0;

	const allClips = [...videoTracks.flatMap((t) => t.clips), ...audioTracks.flatMap((t) => t.clips)];
	const uniqueSrcs = [...new Set(allClips.map((c) => c.src))];

	uniqueSrcs.forEach((src) => {
		const filePath = mediaFiles.get(src);
		if (filePath) {
			inputFileMap.set(src, inputIndex);
			inputFiles.push(filePath);
			console.log(`[FFmpeg] Input ${inputIndex}: ${filePath}`);
			inputIndex++;
		}
	});

	if (!cachedFFmpegPath) cachedFFmpegPath = getFFmpegPath();
	const ffmpegPath = cachedFFmpegPath;

	return new Promise((resolve, reject) => {
		if (inputFiles.length === 0) {
			const command = ffmpeg();
			command.setFfmpegPath(ffmpegPath);

			command
				.input(`color=c=black:s=1920x1080:r=60:d=${timeline.duration || 1}`)
				.inputFormat("lavfi")
				.input(`anullsrc=channel_layout=stereo:sample_rate=48000:d=${timeline.duration || 1}`)
				.inputFormat("lavfi")
				.outputOptions(["-c:v libx264", "-preset medium", "-crf 23", "-c:a aac", "-b:a 192k", "-pix_fmt yuv420p", "-shortest"])
				.output(outputPath);

			command.on("progress", (progress) => {
				if (onProgress && progress.percent) {
					onProgress(Math.min(99, Math.max(0, progress.percent)));
				}
			});

			command.on("error", (err, stdout, stderr) => {
				console.error(`[FFmpeg] Error: ${err.message}`);
				console.error(`[FFmpeg] stderr: ${stderr}`);
				reject(new Error(`FFmpeg error: ${err.message}`));
			});

			command.on("end", () => {
				if (onProgress) onProgress(100);
				resolve();
			});

			command.run();
			return;
		}

		const complexFilter = buildComplexFilter(timeline, videoTracks, audioTracks, inputFileMap);

		const command = ffmpeg();
		command.setFfmpegPath(ffmpegPath);

		inputFiles.forEach((file) => {
			command.input(file);
		});

		command
			.complexFilter(complexFilter)
			.outputOptions([
				"-map",
				"[vout]",
				"-map",
				"[aout]",
				"-c:v libx264",
				"-preset medium",
				"-crf 23",
				"-c:a aac",
				"-b:a 192k",
				"-r 60", // 60 fps
				"-pix_fmt yuv420p",
				"-t " + timeline.duration,
			])
			.output(outputPath);

		command.on("progress", (progress) => {
			if (onProgress && progress.percent) {
				const progressValue = Math.min(99, Math.max(0, progress.percent));
				onProgress(progressValue);
			}
		});

		command.on("error", (err, stdout, stderr) => {
			console.error(`[FFmpeg] Error: ${err.message}`);
			console.error(`[FFmpeg] stderr: ${stderr}`);
			reject(new Error(`FFmpeg error: ${err.message}`));
		});

		command.on("end", () => {
			console.log(`[FFmpeg] Render completed successfully`);
			if (onProgress) onProgress(100);
			resolve();
		});

		command.run();
	});
}

export async function downloadMediaFiles(mediaUrls: Record<string, string>): Promise<Map<string, string>> {
	const tempBase = path.join(os.tmpdir(), "editmash");
	await fs.mkdir(tempBase, { recursive: true });
	const tempDir = await fs.mkdtemp(path.join(tempBase, path.sep));
	const fileMap = new Map<string, string>();

	const envBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
	const baseUrl = envBaseUrl.startsWith("http") ? envBaseUrl : envBaseUrl ? `https://${envBaseUrl}` : "http://localhost:3000";

	for (const [src, url] of Object.entries(mediaUrls)) {
		try {
			const absoluteUrl = url.startsWith("/") ? `${baseUrl}${url}` : url;

			const response = await fetch(absoluteUrl);
			if (!response.ok) {
				throw new Error(`Failed to download ${absoluteUrl}: ${response.statusText}`);
			}

			const buffer = await response.arrayBuffer();
			const extension = path.extname(new URL(absoluteUrl).pathname) || ".mp4";
			const fileName = `input_${Date.now()}_${Math.random().toString(36).substring(7)}${extension}`;
			const filePath = path.join(tempDir, fileName);

			await fs.writeFile(filePath, Buffer.from(buffer));
			fileMap.set(src, filePath);
		} catch (error) {
			console.error(`Error downloading ${url}:`, error);
			throw error;
		}
	}

	return fileMap;
}

export async function cleanupTempFiles(fileMap: Map<string, string>): Promise<void> {
	const tempDirs = new Set<string>();

	for (const filePath of fileMap.values()) {
		tempDirs.add(path.dirname(filePath));
		try {
			await fs.unlink(filePath);
		} catch (error) {
			console.error(`Error deleting ${filePath}:`, error);
		}
	}

	for (const dir of tempDirs) {
		try {
			await fs.rm(dir, { recursive: true, force: true });
		} catch (error) {
			console.error(`Error deleting directory ${dir}:`, error);
		}
	}
}
