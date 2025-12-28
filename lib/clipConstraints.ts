export interface ClipConstraintConfig {
	timelineDuration: number;
	clipSizeMin: number;
	clipSizeMax: number;
	audioMaxDb: number;
	maxVideoTracks: number;
	maxAudioTracks: number;
	maxClipsPerUser: number;
	constraints: string[];
}

export interface ClipForValidation {
	id: string;
	type: "video" | "audio" | "image";
	startTime: number;
	duration: number;
	properties?: {
		volume?: number;
		[key: string]: unknown;
	};
}

export interface TrackForValidation {
	id: string;
	type: "video" | "audio";
	clips: ClipForValidation[];
}

export interface TimelineForValidation {
	duration: number;
	tracks: TrackForValidation[];
}

export interface ValidationResult {
	valid: boolean;
	reason?: string;
	code?: string;
}

export interface ConstraintContext {
	clip: ClipForValidation;
	trackId: string;
	config: ClipConstraintConfig;
	timeline: TimelineForValidation;
	existingClipId?: string;
}

type ConstraintValidator = (context: ConstraintContext) => ValidationResult;

function parseConstraint(constraint: string): { type: string; params: string[] } {
	const parts = constraint.split(":");
	return {
		type: parts[0],
		params: parts.slice(1),
	};
}

function validateClipDuration(context: ConstraintContext): ValidationResult {
	const { clip, config } = context;

	if (clip.duration < config.clipSizeMin) {
		return {
			valid: false,
			reason: `Clip duration (${clip.duration.toFixed(2)}s) is shorter than minimum allowed (${config.clipSizeMin}s)`,
			code: "CLIP_TOO_SHORT",
		};
	}

	if (clip.duration > config.clipSizeMax) {
		return {
			valid: false,
			reason: `Clip duration (${clip.duration.toFixed(2)}s) exceeds maximum allowed (${config.clipSizeMax}s)`,
			code: "CLIP_TOO_LONG",
		};
	}

	return { valid: true };
}

function validateTimelineBounds(context: ConstraintContext): ValidationResult {
	const { clip, config } = context;
	const clipEnd = clip.startTime + clip.duration;

	if (clip.startTime < 0) {
		return {
			valid: false,
			reason: "Clip cannot start before timeline beginning",
			code: "CLIP_BEFORE_START",
		};
	}

	if (clipEnd > config.timelineDuration) {
		return {
			valid: false,
			reason: `Clip extends beyond timeline duration (ends at ${clipEnd.toFixed(2)}s, timeline is ${config.timelineDuration}s)`,
			code: "CLIP_BEYOND_END",
		};
	}

	return { valid: true };
}

function validateAudioVolume(context: ConstraintContext): ValidationResult {
	const { clip, config } = context;

	if (clip.type !== "audio") {
		return { valid: true };
	}

	const volume = clip.properties?.volume;
	if (volume !== undefined && volume > 0) {
		const volumeDb = 20 * Math.log10(volume);
		const epsilon = 0.01;
		if (volumeDb > config.audioMaxDb + epsilon) {
			return {
				valid: false,
				reason: `Audio volume (${volumeDb.toFixed(1)} dB) exceeds maximum allowed (${config.audioMaxDb} dB)`,
				code: "VOLUME_TOO_HIGH",
			};
		}
	}

	return { valid: true };
}

function validateTrackCount(context: ConstraintContext): ValidationResult {
	const { trackId, config, timeline, clip } = context;

	const track = timeline.tracks.find((t) => t.id === trackId);
	if (!track) {
		const videoTrackCount = timeline.tracks.filter((t) => t.type === "video").length;
		const audioTrackCount = timeline.tracks.filter((t) => t.type === "audio").length;

		const isVideo = clip.type === "video" || clip.type === "image";

		if (isVideo && videoTrackCount >= config.maxVideoTracks) {
			return {
				valid: false,
				reason: `Maximum video track limit reached (${config.maxVideoTracks})`,
				code: "MAX_VIDEO_TRACKS",
			};
		}

		if (!isVideo && audioTrackCount >= config.maxAudioTracks) {
			return {
				valid: false,
				reason: `Maximum audio track limit reached (${config.maxAudioTracks})`,
				code: "MAX_AUDIO_TRACKS",
			};
		}
	}

	return { valid: true };
}

function validateFixedDuration(context: ConstraintContext, params: string[]): ValidationResult {
	const { clip } = context;

	if (params.length < 1) {
		return { valid: true };
	}

	const durationStr = params[0];
	const fixedDuration = parseFloat(durationStr.replace("s", ""));

	const tolerance = 0.01; // 10ms
	if (Math.abs(clip.duration - fixedDuration) > tolerance) {
		return {
			valid: false,
			reason: `Clip duration must be exactly ${fixedDuration}s (got ${clip.duration.toFixed(2)}s)`,
			code: "FIXED_DURATION_MISMATCH",
		};
	}

	return { valid: true };
}

function validateAllowedTypes(context: ConstraintContext, params: string[]): ValidationResult {
	const { clip } = context;

	if (params.length < 1) {
		return { valid: true };
	}

	const allowedTypes = params[0].split(",").map((t) => t.trim().toLowerCase());

	if (!allowedTypes.includes(clip.type)) {
		return {
			valid: false,
			reason: `Clip type "${clip.type}" is not allowed. Allowed types: ${allowedTypes.join(", ")}`,
			code: "TYPE_NOT_ALLOWED",
		};
	}

	return { valid: true };
}

function validateCustomConstraints(context: ConstraintContext): ValidationResult {
	const { config } = context;

	for (const constraint of config.constraints) {
		const { type, params } = parseConstraint(constraint);

		let result: ValidationResult = { valid: true };

		switch (type) {
			case "fixedClipDuration":
				result = validateFixedDuration(context, params);
				break;
			case "allowedTypes":
				result = validateAllowedTypes(context, params);
				break;
			default:
				console.warn(`Unknown constraint type: ${type}`);
		}

		if (!result.valid) {
			return result;
		}
	}

	return { valid: true };
}

const coreValidators: ConstraintValidator[] = [validateClipDuration, validateTimelineBounds, validateAudioVolume, validateTrackCount];

export function validatePlayerClipLimit(config: ClipConstraintConfig, playerClipCount: number): ValidationResult {
	if (config.maxClipsPerUser > 0 && playerClipCount >= config.maxClipsPerUser) {
		return {
			valid: false,
			reason: `You have reached the maximum clip limit (${config.maxClipsPerUser} clips per player)`,
			code: "MAX_CLIPS_PER_USER",
		};
	}
	return { valid: true };
}

export function validateClipConstraints(
	clip: ClipForValidation,
	config: ClipConstraintConfig,
	timeline: TimelineForValidation,
	trackId: string,
	existingClipId?: string
): ValidationResult {
	const context: ConstraintContext = {
		clip,
		trackId,
		config,
		timeline,
		existingClipId,
	};

	for (const validator of coreValidators) {
		const result = validator(context);
		if (!result.valid) {
			return result;
		}
	}

	const customResult = validateCustomConstraints(context);
	if (!customResult.valid) {
		return customResult;
	}

	return { valid: true };
}

export function validateClipUpdate(
	clipId: string,
	updates: Partial<ClipForValidation>,
	config: ClipConstraintConfig,
	timeline: TimelineForValidation,
	trackId: string
): ValidationResult {
	let existingClip: ClipForValidation | undefined;
	for (const track of timeline.tracks) {
		const found = track.clips.find((c) => c.id === clipId);
		if (found) {
			existingClip = found;
			break;
		}
	}

	if (!existingClip) {
		return {
			valid: false,
			reason: "Clip not found",
			code: "CLIP_NOT_FOUND",
		};
	}

	const mergedClip: ClipForValidation = {
		...existingClip,
		...updates,
		properties: {
			...existingClip.properties,
			...updates.properties,
		},
	};

	return validateClipConstraints(mergedClip, config, timeline, trackId, clipId);
}

export function validateClipSplit(
	originalClip: ClipForValidation,
	newClip: ClipForValidation,
	config: ClipConstraintConfig,
	timeline: TimelineForValidation,
	trackId: string
): ValidationResult {
	const originalResult = validateClipConstraints(originalClip, config, timeline, trackId, originalClip.id);
	if (!originalResult.valid) {
		return {
			valid: false,
			reason: `Original clip after split: ${originalResult.reason}`,
			code: originalResult.code,
		};
	}

	const newResult = validateClipConstraints(newClip, config, timeline, trackId);
	if (!newResult.valid) {
		return {
			valid: false,
			reason: `New clip from split: ${newResult.reason}`,
			code: newResult.code,
		};
	}

	return { valid: true };
}

export function clampAudioVolume(volume: number, maxDb: number): number {
	const maxLinear = Math.pow(10, maxDb / 20);
	return Math.min(volume, maxLinear);
}

export function linearToDb(volume: number): number {
	if (volume <= 0) return -Infinity;
	return 20 * Math.log10(volume);
}

export function dbToLinear(db: number): number {
	return Math.pow(10, db / 20);
}

export function clampClipDuration(duration: number, minDuration: number, maxDuration: number): number {
	return Math.max(minDuration, Math.min(duration, maxDuration));
}

export function clampClipToTimeline(
	startTime: number,
	duration: number,
	timelineDuration: number
): { startTime: number; duration: number } {
	let clampedStart = Math.max(0, startTime);
	let clampedDuration = duration;

	if (clampedStart + clampedDuration > timelineDuration) {
		clampedDuration = timelineDuration - clampedStart;
	}

	if (clampedDuration <= 0) {
		clampedStart = Math.max(0, timelineDuration - duration);
		clampedDuration = Math.min(duration, timelineDuration);
	}

	return { startTime: clampedStart, duration: clampedDuration };
}

export function validateMatchConfig(config: Partial<ClipConstraintConfig>): ValidationResult {
	if (config.timelineDuration !== undefined) {
		if (config.timelineDuration <= 0) {
			return { valid: false, reason: "Timeline duration must be positive" };
		}
		if (config.timelineDuration > 60) {
			return { valid: false, reason: "Timeline duration cannot exceed 60 seconds" };
		}
	}

	if (config.clipSizeMin !== undefined && config.clipSizeMin < 0) {
		return { valid: false, reason: "Minimum clip size cannot be negative" };
	}

	if (config.clipSizeMax !== undefined && config.clipSizeMin !== undefined) {
		if (config.clipSizeMax < config.clipSizeMin) {
			return { valid: false, reason: "Maximum clip size must be >= minimum clip size" };
		}
	}

	if (config.audioMaxDb !== undefined && config.audioMaxDb < -60) {
		return { valid: false, reason: "Audio max dB cannot be below -60 dB" };
	}

	if (config.maxVideoTracks !== undefined && config.maxVideoTracks < 1) {
		return { valid: false, reason: "Must allow at least 1 video track" };
	}

	if (config.maxAudioTracks !== undefined && config.maxAudioTracks < 0) {
		return { valid: false, reason: "Audio track count cannot be negative" };
	}

	if (config.maxClipsPerUser !== undefined && config.maxClipsPerUser < 0) {
		return { valid: false, reason: "Max clips per user cannot be negative" };
	}

	return { valid: true };
}
