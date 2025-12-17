import { Clip, TimelineState, AudioClip } from "../app/types/timeline";
import { MatchConfig } from "../app/types/match";

export interface ValidationResult {
	valid: boolean;
	reason?: string;
}

export interface ConstraintContext {
	clip: Clip;
	trackId: string;
	config: MatchConfig;
	timeline: TimelineState;
	existingClipId?: string;
}

export interface PlayerConstraintContext extends ConstraintContext {
	playerClipCount: number;
}

type ConstraintValidator = (context: ConstraintContext) => ValidationResult;

/**
 * Format: "type:param1:param2:..."
 */
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
		};
	}

	if (clip.duration > config.clipSizeMax) {
		return {
			valid: false,
			reason: `Clip duration (${clip.duration.toFixed(2)}s) exceeds maximum allowed (${config.clipSizeMax}s)`,
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
		};
	}

	if (clipEnd > config.timelineDuration) {
		return {
			valid: false,
			reason: `Clip extends beyond timeline duration (ends at ${clipEnd.toFixed(2)}s, timeline is ${config.timelineDuration}s)`,
		};
	}

	return { valid: true };
}

function validateAudioVolume(context: ConstraintContext): ValidationResult {
	const { clip, config } = context;

	if (clip.type !== "audio") {
		return { valid: true };
	}

	const audioClip = clip as AudioClip;
	if (audioClip.properties.volume > config.audioMaxVolume) {
		return {
			valid: false,
			reason: `Audio volume (${audioClip.properties.volume.toFixed(2)}) exceeds maximum allowed (${config.audioMaxVolume})`,
		};
	}

	return { valid: true };
}

function validateTrackCount(context: ConstraintContext): ValidationResult {
	const { trackId, config, timeline } = context;

	const track = timeline.tracks.find((t) => t.id === trackId);
	if (!track) {
		const videoTrackCount = timeline.tracks.filter((t) => t.type === "video").length;
		const audioTrackCount = timeline.tracks.filter((t) => t.type === "audio").length;

		const isVideo = context.clip.type === "video" || context.clip.type === "image";

		if (isVideo && videoTrackCount >= config.maxVideoTracks) {
			return {
				valid: false,
				reason: `Maximum video track limit reached (${config.maxVideoTracks})`,
			};
		}

		if (!isVideo && audioTrackCount >= config.maxAudioTracks) {
			return {
				valid: false,
				reason: `Maximum audio track limit reached (${config.maxAudioTracks})`,
			};
		}
	}

	return { valid: true };
}

/**
 * Format: "fixedClipDuration:Xs" (e.g., "fixedClipDuration:3s")
 */
function validateFixedDuration(context: ConstraintContext, params: string[]): ValidationResult {
	const { clip } = context;

	if (params.length < 1) {
		return { valid: true };
	}

	const durationStr = params[0];
	const fixedDuration = parseFloat(durationStr.replace("s", ""));

	const tolerance = 0.01; // 10ms tolerance
	if (Math.abs(clip.duration - fixedDuration) > tolerance) {
		return {
			valid: false,
			reason: `Clip duration must be exactly ${fixedDuration}s (got ${clip.duration.toFixed(2)}s)`,
		};
	}

	return { valid: true };
}

/**
 * Format: "allowedTypes:video,audio" or "allowedTypes:image"
 */
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

export function validatePlayerClipLimit(config: MatchConfig, playerClipCount: number): ValidationResult {
	if (config.maxClipsPerUser > 0 && playerClipCount >= config.maxClipsPerUser) {
		return {
			valid: false,
			reason: `You have reached the maximum clip limit (${config.maxClipsPerUser} clips per player)`,
		};
	}
	return { valid: true };
}

export function validateClip(
	clip: Clip,
	config: MatchConfig,
	timeline: TimelineState,
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

export function validateTimeline(timeline: TimelineState, config: MatchConfig): ValidationResult {
	const videoTrackCount = timeline.tracks.filter((t) => t.type === "video").length;
	const audioTrackCount = timeline.tracks.filter((t) => t.type === "audio").length;

	if (videoTrackCount > config.maxVideoTracks) {
		return {
			valid: false,
			reason: `Too many video tracks (${videoTrackCount}), maximum is ${config.maxVideoTracks}`,
		};
	}

	if (audioTrackCount > config.maxAudioTracks) {
		return {
			valid: false,
			reason: `Too many audio tracks (${audioTrackCount}), maximum is ${config.maxAudioTracks}`,
		};
	}

	for (const track of timeline.tracks) {
		for (const clip of track.clips) {
			const result = validateClip(clip, config, timeline, track.id, clip.id);
			if (!result.valid) {
				return result;
			}
		}
	}

	return { valid: true };
}

export function validateMatchConfig(config: Partial<MatchConfig>): ValidationResult {
	if (config.timelineDuration !== undefined) {
		if (config.timelineDuration <= 0) {
			return { valid: false, reason: "Timeline duration must be positive" };
		}
		if (config.timelineDuration > 60) {
			return { valid: false, reason: "Timeline duration cannot exceed 60 seconds" };
		}
	}

	if (config.matchDuration !== undefined) {
		if (config.matchDuration <= 0) {
			return { valid: false, reason: "Match duration must be positive" };
		}
		if (config.matchDuration > 10) {
			return { valid: false, reason: "Match duration cannot exceed 10 minutes" };
		}
	}

	if (config.maxPlayers !== undefined && config.maxPlayers < 1) {
		return { valid: false, reason: "Max players must be at least 1" };
	}

	if (config.clipSizeMin !== undefined && config.clipSizeMin < 0) {
		return { valid: false, reason: "Minimum clip size cannot be negative" };
	}

	if (config.clipSizeMax !== undefined && config.clipSizeMin !== undefined) {
		if (config.clipSizeMax < config.clipSizeMin) {
			return { valid: false, reason: "Maximum clip size must be >= minimum clip size" };
		}
	}

	if (config.audioMaxVolume !== undefined && config.audioMaxVolume < 0) {
		return { valid: false, reason: "Audio max volume cannot be negative" };
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
