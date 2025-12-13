import ffmpeg from "fluent-ffmpeg";
import { TimelineState, VideoClip, AudioClip, Track } from "../app/types/timeline";
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

function generateVideoFilter(clip: VideoClip, inputIndex: number, outputLabel: string): string {
	const props = clip.properties;
	const filters: string[] = [];

	// 1. extract the portion of video based on sourceIn and duration
	const endTime = clip.sourceIn + clip.duration / props.speed;
	filters.push(`[${inputIndex}:v]trim=start=${clip.sourceIn}:end=${endTime},setpts=PTS-STARTPTS`);

	// 2. speed
	if (props.speed !== 1) {
		filters.push(`setpts=${1 / props.speed}*PTS`);
	}

	// 3. freeze frame
	if (props.freezeFrame) {
		const remainingDuration = clip.duration - props.freezeFrameTime;
		const frameDuration = 0.04;
		const loopCount = Math.ceil(remainingDuration / frameDuration);
		
		filters.push(`trim=start=${props.freezeFrameTime}:duration=${frameDuration},loop=loop=${loopCount}:size=1`);
	}

	// 4. crop
	if (props.crop.left > 0 || props.crop.right > 0 || props.crop.top > 0 || props.crop.bottom > 0) {
		// note: crop filter uses pixels from top-left corner
		filters.push(
			`crop=iw-${props.crop.left}-${props.crop.right}:ih-${props.crop.top}-${props.crop.bottom}:${props.crop.left}:${props.crop.top}`
		);
	}

	// 5. zoom
	const finalWidth = Math.round(props.size.width * props.zoom.x);
	const finalHeight = Math.round(props.size.height * props.zoom.y);
	filters.push(`scale=${finalWidth}:${finalHeight}`);

	// 6. flip
	if (props.flip.horizontal) {
		filters.push(`hflip`);
	}
	if (props.flip.vertical) {
		filters.push(`vflip`);
	}

	// 7. rotation
	if (props.rotation !== 0) {
		const radians = (props.rotation * Math.PI) / 180;
		filters.push(`rotate=${radians}:c=none:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`);
	}

	// 8. pitch & yaw
	if (props.pitch !== 0) {
		const pitchScale = Math.cos((props.pitch * Math.PI) / 180);
		if (pitchScale > 0.1) {
			filters.push(`scale=iw:ih*${pitchScale}`);
		}
	}
	if (props.yaw !== 0) {
		const yawScale = Math.cos((props.yaw * Math.PI) / 180);
		if (yawScale > 0.1) {
			filters.push(`scale=iw*${yawScale}:ih`);
		}
	}

	filters.push(`format=yuva420p`);

	const filterString = filters.join(",") + `[${outputLabel}]`;
	return filterString;
}

function generateAudioFilter(clip: AudioClip, inputIndex: number, outputLabel: string): string {
	const props = clip.properties;
	const filters: string[] = [];

	// 1. extract the portion of audio based on sourceIn and duration
	const endTime = clip.sourceIn + clip.duration / props.speed;
	filters.push(`[${inputIndex}:a]atrim=start=${clip.sourceIn}:end=${endTime},asetpts=PTS-STARTPTS`);

	// 2. speed
	if (props.speed !== 1) {
		let speed = props.speed;
		while (speed > 2.0) {
			filters.push(`atempo=2.0`);
			speed /= 2.0;
		}
		while (speed < 0.5) {
			filters.push(`atempo=0.5`);
			speed *= 2.0;
		}
		if (speed !== 1.0) {
			filters.push(`atempo=${speed}`);
		}
	}

	// 3. volume
	if (props.volume !== 1) {
		filters.push(`volume=${props.volume}`);
	}

	// 4. pan
	if (props.pan !== 0) {
		const leftGain = props.pan <= 0 ? 1 : 1 - props.pan;
		const rightGain = props.pan >= 0 ? 1 : 1 + props.pan;
		filters.push(`pan=stereo|c0=${leftGain}*c0|c1=${rightGain}*c1`);
	}

	// 5. pitch
	if (props.pitch !== 0) {
		const ratio = Math.pow(2, props.pitch / 12);

		const newRate = 48000 * ratio;
		filters.push(`asetrate=${newRate},aresample=48000`);
	}

	const filterString = filters.join(",") + `[${outputLabel}]`;
	return filterString;
}

function buildComplexFilter(
	timeline: TimelineState,
	videoTracks: Track[],
	audioTracks: Track[],
	inputFileMap: Map<string, number>
): string {
	const filterChains: string[] = [];
	const canvasWidth = 1920;
	const canvasHeight = 1080;
	const duration = timeline.duration || 1;

	const videoOutputs: string[] = [];
	let videoLabelCounter = 0;

	videoTracks.forEach((track, trackIndex) => {
		track.clips.forEach((clip, clipIndex) => {
			const videoClip = clip as VideoClip;
			const inputIndex = inputFileMap.get(videoClip.src);
			if (inputIndex === undefined) return;

			const label = `v${videoLabelCounter++}`;

			const filter = generateVideoFilter(videoClip, inputIndex, label);
			filterChains.push(filter);

			videoOutputs.push(JSON.stringify({ label, clip: videoClip, trackIndex }));
		});
	});

	const timelineSegments: Array<{ label: string; clip: VideoClip; trackIndex: number }> = videoOutputs.map((s) => JSON.parse(s));

	filterChains.push(`color=c=black:s=${canvasWidth}x${canvasHeight}:d=${duration}:r=30[base]`);

	if (timelineSegments.length === 0) {
		filterChains.push(`[base]copy[vout]`);
	} else {
		timelineSegments.sort((a, b) => b.trackIndex - a.trackIndex);

		let currentBase = "base";
		timelineSegments.forEach((segment, idx) => {
			const { label, clip } = segment;
			const outputLabel = idx === timelineSegments.length - 1 ? "vout" : `overlay${idx}`;

			const x = clip.properties.position.x;
			const y = clip.properties.position.y;

			const enable = `between(t,${clip.startTime},${clip.startTime + clip.duration})`;

			filterChains.push(`[${currentBase}][${label}]overlay=${x}:${y}:enable='${enable}'[${outputLabel}]`);
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
