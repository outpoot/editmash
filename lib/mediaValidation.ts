import { spawn } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";

export const MAX_VIDEO_WIDTH = 1920;
export const MAX_VIDEO_HEIGHT = 1080;
export const MAX_VIDEO_PIXELS = MAX_VIDEO_WIDTH * MAX_VIDEO_HEIGHT;

export const MAX_IMAGE_WIDTH = 4000;
export const MAX_IMAGE_HEIGHT = 4000;
export const MAX_IMAGE_PIXELS = MAX_IMAGE_WIDTH * MAX_IMAGE_HEIGHT;

export interface MediaMetadata {
	width: number;
	height: number;
	duration?: number;
	codec?: string;
	format?: string;
	frameRate?: number;
	bitRate?: number;
}

export interface MediaValidationResult {
	valid: boolean;
	error?: string;
	metadata?: MediaMetadata;
}

const getFFprobePath = (): string => {
	const platform = process.platform;
	let possiblePaths: string[] = [];

	if (platform === "win32") {
		possiblePaths = [
			"C:\\Program Files\\FFmpeg\\bin\\ffprobe.exe",
			"C:\\Program Files\\ShareX\\ffprobe.exe",
			"C:\\ffmpeg\\bin\\ffprobe.exe",
			"C:\\ffmpeg\\ffprobe.exe",
			path.join(os.homedir(), "ffmpeg", "bin", "ffprobe.exe"),
			path.join(os.homedir(), "ffmpeg", "ffprobe.exe"),
		];
	} else if (platform === "darwin") {
		possiblePaths = [
			"/opt/homebrew/bin/ffprobe",
			"/usr/local/bin/ffprobe",
			"/usr/bin/ffprobe",
			path.join(os.homedir(), ".local", "bin", "ffprobe"),
			path.join(os.homedir(), "bin", "ffprobe"),
		];
	} else {
		possiblePaths = [
			"/usr/bin/ffprobe",
			"/usr/local/bin/ffprobe",
			"/snap/bin/ffprobe",
			"/usr/bin/local/ffprobe",
			path.join(os.homedir(), ".local", "bin", "ffprobe"),
			path.join(os.homedir(), "bin", "ffprobe"),
		];
	}

	for (const ffprobePath of possiblePaths) {
		if (fsSync.existsSync(ffprobePath)) {
			return ffprobePath;
		}
	}

	return "ffprobe";
};

let cachedFFprobePath: string | null = null;

export async function probeMediaFile(filePath: string): Promise<MediaMetadata> {
	if (!cachedFFprobePath) {
		cachedFFprobePath = getFFprobePath();
	}

	return new Promise((resolve, reject) => {
		const args = [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height,duration,codec_name,r_frame_rate,bit_rate",
			"-show_entries",
			"format=duration,format_name",
			"-of",
			"json",
			"-timeout",
			"10000000", // 10 seconds
			filePath,
		];

		const ffprobe = spawn(cachedFFprobePath!, args, {
			timeout: 15000,
		});

		let stdout = "";
		let stderr = "";

		ffprobe.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		ffprobe.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		ffprobe.on("error", (error) => {
			reject(new Error(`FFprobe failed to start: ${error.message}`));
		});

		ffprobe.on("close", (code) => {
			if (code !== 0) {
				if (stderr.includes("Invalid frame size") || stderr.includes("Invalid data")) {
					reject(new Error("Invalid or corrupted media file detected"));
					return;
				}
				reject(new Error(`FFprobe exited with code ${code}: ${stderr}`));
				return;
			}

			try {
				const data = JSON.parse(stdout);
				const stream = data.streams?.[0];
				const format = data.format;

				if (!stream) {
					reject(new Error("No video stream found in file"));
					return;
				}

				let frameRate: number | undefined;
				if (stream.r_frame_rate) {
					const [num, den] = stream.r_frame_rate.split("/").map(Number);
					frameRate = den ? num / den : num;
				}

				const metadata: MediaMetadata = {
					width: stream.width,
					height: stream.height,
					duration: parseFloat(stream.duration || format?.duration) || undefined,
					codec: stream.codec_name,
					format: format?.format_name,
					frameRate,
					bitRate: stream.bit_rate ? parseInt(stream.bit_rate) : undefined,
				};

				resolve(metadata);
			} catch (parseError) {
				reject(new Error(`Failed to parse FFprobe output: ${parseError}`));
			}
		});
	});
}

export async function probeMediaBuffer(buffer: Buffer, extension: string): Promise<MediaMetadata> {
	const sanitizedExt = extension.replace(/[^a-zA-Z0-9]/g, "") || "tmp";
	const tempDir = os.tmpdir();
	const tempFile = path.join(tempDir, `probe_${Date.now()}_${Math.random().toString(36).substring(7)}.${sanitizedExt}`);

	try {
		await fs.writeFile(tempFile, buffer);
		const metadata = await probeMediaFile(tempFile);
		return metadata;
	} finally {
		try {
			await fs.unlink(tempFile);
		} catch {
			// ignore
		}
	}
}

export function validateVideoDimensions(metadata: MediaMetadata): MediaValidationResult {
	const { width, height } = metadata;

	if (!width || !height || width <= 0 || height <= 0) {
		return {
			valid: false,
			error: "Could not determine video dimensions",
		};
	}

	if (width > MAX_VIDEO_WIDTH) {
		return {
			valid: false,
			error: `Video width (${width}px) exceeds maximum allowed (${MAX_VIDEO_WIDTH}px). This may be a malformed file.`,
		};
	}

	if (height > MAX_VIDEO_HEIGHT) {
		return {
			valid: false,
			error: `Video height (${height}px) exceeds maximum allowed (${MAX_VIDEO_HEIGHT}px). This may be a malformed file.`,
		};
	}

	const totalPixels = width * height;
	if (totalPixels > MAX_VIDEO_PIXELS) {
		return {
			valid: false,
			error: `Video resolution (${width}x${height} = ${(totalPixels / 1000000).toFixed(1)}MP) exceeds maximum allowed (${(MAX_VIDEO_PIXELS / 1000000).toFixed(1)}MP). This may be a malformed file.`,
		};
	}

	return {
		valid: true,
		metadata,
	};
}

export function validateImageDimensions(metadata: MediaMetadata): MediaValidationResult {
	const { width, height } = metadata;

	if (!width || !height || width <= 0 || height <= 0) {
		return {
			valid: false,
			error: "Could not determine image dimensions",
		};
	}

	if (width > MAX_IMAGE_WIDTH) {
		return {
			valid: false,
			error: `Image width (${width}px) exceeds maximum allowed (${MAX_IMAGE_WIDTH}px)`,
		};
	}

	if (height > MAX_IMAGE_HEIGHT) {
		return {
			valid: false,
			error: `Image height (${height}px) exceeds maximum allowed (${MAX_IMAGE_HEIGHT}px)`,
		};
	}

	const totalPixels = width * height;
	if (totalPixels > MAX_IMAGE_PIXELS) {
		return {
			valid: false,
			error: `Image resolution (${width}x${height}) exceeds maximum allowed`,
		};
	}

	return {
		valid: true,
		metadata,
	};
}

export async function validateVideoFile(buffer: Buffer, extension: string): Promise<MediaValidationResult> {
	try {
		const metadata = await probeMediaBuffer(buffer, extension);
		return validateVideoDimensions(metadata);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		if (errorMessage.includes("Invalid") || errorMessage.includes("corrupted")) {
			return {
				valid: false,
				error: "Invalid or corrupted video file",
			};
		}

		return {
			valid: false,
			error: `Failed to validate video: ${errorMessage}`,
		};
	}
}

export async function validateImageFile(buffer: Buffer, extension: string): Promise<MediaValidationResult> {
	try {
		const metadata = await probeMediaBuffer(buffer, extension);
		return validateImageDimensions(metadata);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			valid: false,
			error: `Failed to validate image: ${errorMessage}`,
		};
	}
}
