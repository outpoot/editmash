export type FileCategory = "video" | "audio" | "image";

const VIDEO_SIZE_LIMITS_MB  = 50;
const AUDIO_SIZE_LIMITS_MB = 10;
const IMAGE_SIZE_LIMITS_MB = 5;

export const FILE_SIZE_LIMITS: Record<FileCategory, number> = {
	video: VIDEO_SIZE_LIMITS_MB  * 1024 * 1024,
	audio: AUDIO_SIZE_LIMITS_MB * 1024 * 1024,
	image: IMAGE_SIZE_LIMITS_MB * 1024 * 1024,
};

const FILE_SIZE_LIMITS_MB: Record<FileCategory, number> = {
	video: VIDEO_SIZE_LIMITS_MB,
	audio: AUDIO_SIZE_LIMITS_MB,
	image: IMAGE_SIZE_LIMITS_MB,
};

export const ALLOWED_MIME_TYPES: Record<FileCategory, string[]> = {
	video: [
		"video/mp4",
		"video/webm",
		"video/quicktime", // .mov
		"video/x-msvideo", // .avi
		"video/x-matroska", // .mkv
	],
	audio: [
		"audio/mpeg", // .mp3
		"audio/wav",
		"audio/x-wav",
		"audio/ogg",
		"audio/aac",
		"audio/x-m4a",
		"audio/mp4", // .m4a
		"audio/webm",
	],
	image: ["image/jpeg", "image/png", "image/webp"],
};

export const ALLOWED_EXTENSIONS: Record<FileCategory, string[]> = {
	video: ["mp4", "webm", "mov", "avi", "mkv"],
	audio: ["mp3", "wav", "ogg", "aac", "m4a", "webm"],
	image: ["jpg", "jpeg", "png", "webp"],
};

export const EXTENSION_TO_MIME: Record<string, string> = {
	// Video
	mp4: "video/mp4",
	webm: "video/webm",
	mov: "video/quicktime",
	avi: "video/x-msvideo",
	mkv: "video/x-matroska",
	// Audio
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	aac: "audio/aac",
	m4a: "audio/mp4",
	// Image
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};

export const ALL_ALLOWED_MIME_TYPES = new Set([...ALLOWED_MIME_TYPES.video, ...ALLOWED_MIME_TYPES.audio, ...ALLOWED_MIME_TYPES.image]);

export const ALL_ALLOWED_EXTENSIONS = new Set([...ALLOWED_EXTENSIONS.video, ...ALLOWED_EXTENSIONS.audio, ...ALLOWED_EXTENSIONS.image]);

export function getFileCategory(mimeType: string): FileCategory | null {
	for (const [category, types] of Object.entries(ALLOWED_MIME_TYPES)) {
		if (types.includes(mimeType)) {
			return category as FileCategory;
		}
	}
	return null;
}

export function isAllowedExtension(extension: string, category: FileCategory): boolean {
	return ALLOWED_EXTENSIONS[category]?.includes(extension.toLowerCase()) ?? false;
}

export function getFileExtension(filename: string): string {
	return filename.split(".").pop()?.toLowerCase() || "";
}

export function getMimeTypeFromExtension(extension: string): string | null {
	return EXTENSION_TO_MIME[extension.toLowerCase()] || null;
}

export type ValidationErrorType =
	| "no_file"
	| "empty_file"
	| "invalid_mime_type"
	| "invalid_extension"
	| "extension_mismatch"
	| "file_too_large";

export interface ValidationResult {
	valid: boolean;
	error?: ValidationErrorType;
	message?: string;
	category?: FileCategory;
}

export function validateFile(file: { name: string; size: number; type: string }): ValidationResult {
	if (!file) {
		return {
			valid: false,
			error: "no_file",
			message: "No file provided",
		};
	}

	if (file.size === 0) {
		return {
			valid: false,
			error: "empty_file",
			message: "File is empty",
		};
	}

	const category = getFileCategory(file.type);
	if (!category) {
		const allowedFormats = [...ALLOWED_EXTENSIONS.video, ...ALLOWED_EXTENSIONS.audio, ...ALLOWED_EXTENSIONS.image].join(", ");

		return {
			valid: false,
			error: "invalid_mime_type",
			message: `Invalid file type: ${file.type || "unknown"}. Allowed formats: ${allowedFormats}`,
		};
	}

	const extension = getFileExtension(file.name);
	if (!extension) {
		return {
			valid: false,
			error: "invalid_extension",
			message: "File has no extension",
		};
	}

	if (!ALL_ALLOWED_EXTENSIONS.has(extension)) {
		return {
			valid: false,
			error: "invalid_extension",
			message: `File extension .${extension} is not allowed. Allowed: ${ALLOWED_EXTENSIONS[category].join(", ")}`,
		};
	}

	if (!isAllowedExtension(extension, category)) {
		return {
			valid: false,
			error: "extension_mismatch",
			message: `File extension .${extension} doesn't match ${category} file type`,
		};
	}

	const maxSize = FILE_SIZE_LIMITS[category];
	if (file.size > maxSize) {
		const maxSizeMB = FILE_SIZE_LIMITS_MB[category];
		const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
		return {
			valid: false,
			error: "file_too_large",
			message: `${capitalize(category)} file too large (${fileSizeMB}MB). Maximum: ${maxSizeMB}MB`,
		};
	}

	return {
		valid: true,
		category,
	};
}

export function getAcceptAttribute(): string {
	const mimeTypes = [...ALLOWED_MIME_TYPES.video, ...ALLOWED_MIME_TYPES.audio, ...ALLOWED_MIME_TYPES.image];
	const extensions = [
		...ALLOWED_EXTENSIONS.video.map((e) => `.${e}`),
		...ALLOWED_EXTENSIONS.audio.map((e) => `.${e}`),
		...ALLOWED_EXTENSIONS.image.map((e) => `.${e}`),
	];
	return [...mimeTypes, ...extensions].join(",");
}

function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
