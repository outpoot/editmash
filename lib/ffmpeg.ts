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

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

function generateVideoFilter(clip: VideoClip, inputIndex: number, outputLabel: string): string {
	const props = clip.properties;
	const filters: string[] = [];
	const clampedSpeed = Math.max(0.25, Math.min(4, props.speed));

	// 1. extract the portion of video based on sourceIn and duration
	const sourceEndTime = clip.sourceIn + clip.duration * clampedSpeed;
	filters.push(`[${inputIndex}:v]trim=start=${clip.sourceIn}:end=${sourceEndTime},setpts=PTS-STARTPTS`);

	// 2. speed
	if (clampedSpeed !== 1) {
		filters.push(`setpts=${1 / clampedSpeed}*PTS`);
	}

	// 3. freeze frame
	if (props.freezeFrame) {
		const freezePoint = props.freezeFrameTime;
		const frameDuration = 1 / 30; // 30fps, one frame duration
		const loopCount = Math.ceil(clip.duration / frameDuration);
		
		filters.push(`trim=start=${freezePoint}:duration=${frameDuration},loop=loop=${loopCount}:size=1,setpts=PTS-STARTPTS`);
	}

	// 4. crop
	const hasCrop = props.crop.left > 0 || props.crop.right > 0 || props.crop.top > 0 || props.crop.bottom > 0;
	if (hasCrop) {
		filters.push(
			`crop=iw-${props.crop.left}-${props.crop.right}:ih-${props.crop.top}-${props.crop.bottom}:${props.crop.left}:${props.crop.top}`
		);
	}

	// 5. zoom
	const pitchRad = (props.pitch * Math.PI) / 180;
	const yawRad = (props.yaw * Math.PI) / 180;
	
	const L = props.crop.left;
	const R = props.crop.right;
	const T = props.crop.top;
	const B = props.crop.bottom;
	
	const widthMultiplier = props.size.width * props.zoom.x;
	const heightMultiplier = props.size.height * props.zoom.y;
	
	let scaleExpr: string;
	if (hasCrop) {
		scaleExpr = `scale='trunc(${widthMultiplier}*iw/(iw+${L}+${R})/2)*2':'trunc(${heightMultiplier}*ih/(ih+${T}+${B})/2)*2'`;
	} else {
		const finalWidth = Math.round(props.size.width * props.zoom.x);
		const finalHeight = Math.round(props.size.height * props.zoom.y);
		const safeWidth = Math.max(2, finalWidth);
		const safeHeight = Math.max(2, finalHeight);
		const evenWidth = safeWidth % 2 === 0 ? safeWidth : safeWidth + 1;
		const evenHeight = safeHeight % 2 === 0 ? safeHeight : safeHeight + 1;
		scaleExpr = `scale=${evenWidth}:${evenHeight}`;
	}
	
	filters.push(scaleExpr);

	// 6. flip
	if (props.flip.horizontal) {
		filters.push(`hflip`);
	}
	if (props.flip.vertical) {
		filters.push(`vflip`);
	}

	// 7. rotation
	const hasSkew = props.pitch !== 0 || props.yaw !== 0;
	if (hasSkew) {
		const pitchCos = Math.cos(pitchRad);
		const yawCos = Math.cos(yawRad);
		const kx = Math.sin(yawRad) * 0.6;
		const ky = Math.sin(pitchRad) * 0.6;
		
		filters.push(`format=rgba`);
		
		const safeYawCos = Math.max(0.01, Math.abs(yawCos));
		const safePitchCos = Math.max(0.01, Math.abs(pitchCos));
		if (safeYawCos !== 1 || safePitchCos !== 1) {
			filters.push(`scale=iw*${safeYawCos}:ih*${safePitchCos}`);
		}
		
		if (kx !== 0 || ky !== 0) {
			const maxShear = Math.max(Math.abs(kx), Math.abs(ky));
			const padAmount = Math.ceil(maxShear * 1200);
			
			filters.push(`pad=iw+${padAmount * 2}:ih+${padAmount * 2}:${padAmount}:${padAmount}:black@0`);
			filters.push(`shear=shx=${-kx}:shy=${ky}:fillcolor=black@0`);
		}
	}

	if (props.rotation !== 0) {
		const radians = (props.rotation * Math.PI) / 180;
		filters.push(`rotate=${radians}:c=none:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`);
	}

	// 8. pitch & yaw
	if (!hasSkew) {
		filters.push(`format=rgba`);
	}

	if (clip.startTime > 0) {
		filters.push(`setpts=PTS+${clip.startTime}/TB`);
	}

	const filterString = filters.join(",") + `[${outputLabel}]`;
	return filterString;
}

function generateAudioFilter(clip: AudioClip, inputIndex: number, outputLabel: string): string {
	const props = clip.properties;
	const filters: string[] = [];
	const clampedSpeed = Math.max(0.25, Math.min(4, props.speed));

	// 1. extract the portion of audio based on sourceIn and duration
	const sourceEndTime = clip.sourceIn + clip.duration * clampedSpeed;
	filters.push(`[${inputIndex}:a]atrim=start=${clip.sourceIn}:end=${sourceEndTime},asetpts=PTS-STARTPTS`);

	// 2. speed
	if (clampedSpeed !== 1) {
		let speed = clampedSpeed;
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
		const newRate = Math.round(48000 * ratio);
		filters.push(`asetrate=${newRate},aresample=48000`);
	}

	const filterString = filters.join(",") + `[${outputLabel}]`;
	return filterString;
}

function calculateOverlayPosition(clip: VideoClip): { x: string; y: string } {
	const props = clip.properties;
	
	const centerX = props.position.x + props.size.width / 2;
	const centerY = props.position.y + props.size.height / 2;
	
	const L = props.crop.left;
	const R = props.crop.right;
	const T = props.crop.top;
	const B = props.crop.bottom;
	
	const Mw = props.size.width * props.zoom.x;
	const Mh = props.size.height * props.zoom.y;
	
	const pitchRad = (props.pitch * Math.PI) / 180;
	const yawRad = (props.yaw * Math.PI) / 180;
	const hasSkew = props.pitch !== 0 || props.yaw !== 0;
	
	let xExpr: string;
	if (L + R > 0) {
		const cropOffsetExpr = `(${L - R})*(${Mw}-w)/(2*${L + R})`;
		xExpr = `${centerX}-w/2+${cropOffsetExpr}`;
	} else {
		xExpr = `${centerX}-w/2`;
	}
	
	let yExpr: string;
	if (T + B > 0) {
		const cropOffsetExpr = `(${T - B})*(${Mh}-h)/(2*${T + B})`;
		yExpr = `${centerY}-h/2+${cropOffsetExpr}`;
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

	const videoOutputs: string[] = [];
	let videoLabelCounter = 0;

	videoTracks.forEach((track, trackIndex) => {
		track.clips.forEach((clip) => {
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
