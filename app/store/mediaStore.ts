interface MediaItem {
	id: string;
	name: string;
	type: "video" | "audio" | "image";
	url: string;
	duration: number;
	thumbnail?: string;
	width?: number;
	height?: number;
	fileId?: string;
	isUploading?: boolean;
	isDownloading?: boolean;
	uploadProgress?: number;
	uploadError?: string;
	downloadError?: string;
	isRemote?: boolean; // true if uploaded by another player
}

const DEFAULT_IMAGE_DURATION = 2;
const MEDIA_LOAD_TIMEOUT = 30000; // 30 seconds

function generateThumbnail(source: HTMLVideoElement | HTMLImageElement, width: number, height: number): string | undefined {
	if (width <= 0 || height <= 0) return undefined;

	const canvas = document.createElement("canvas");
	canvas.width = 320;
	canvas.height = 180;
	const ctx = canvas.getContext("2d");
	if (!ctx) return undefined;

	const aspect = width / height;
	const thumbAspect = canvas.width / canvas.height;
	let drawWidth, drawHeight, drawX, drawY;

	if (aspect > thumbAspect) {
		drawWidth = canvas.width;
		drawHeight = canvas.width / aspect;
		drawX = 0;
		drawY = (canvas.height - drawHeight) / 2;
	} else {
		drawHeight = canvas.height;
		drawWidth = canvas.height * aspect;
		drawX = (canvas.width - drawWidth) / 2;
		drawY = 0;
	}

	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
	return canvas.toDataURL("image/jpeg", 0.7);
}

class MediaStore {
	private items: MediaItem[] = [];
	private listeners: Set<() => void> = new Set();

	subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify() {
		this.listeners.forEach((listener) => listener());
	}

	addItem(item: MediaItem) {
		this.items.push(item);
		this.notify();
	}

	removeItem(id: string) {
		const item = this.items.find((item) => item.id === id);
		if (item) {
			if (item.url.startsWith("blob:")) {
				URL.revokeObjectURL(item.url);
			}
			if (item.thumbnail && item.thumbnail.startsWith("blob:")) {
				URL.revokeObjectURL(item.thumbnail);
			}
		}
		this.items = this.items.filter((item) => item.id !== id);
		this.notify();
	}

	updateItem(id: string, updates: Partial<MediaItem>) {
		const index = this.items.findIndex((item) => item.id === id);
		if (index !== -1) {
			this.items[index] = { ...this.items[index], ...updates };
			this.notify();
		}
	}

	updateItemId(oldId: string, newId: string) {
		const index = this.items.findIndex((item) => item.id === oldId);
		if (index !== -1) {
			this.items[index] = { ...this.items[index], id: newId };
			this.notify();
		}
	}

	getItems() {
		return [...this.items];
	}

	getItemById(id: string) {
		return this.items.find((item) => item.id === id);
	}

	getItemByUrl(url: string) {
		return this.items.find((item) => item.url === url);
	}

	addRemoteItem(id: string, name: string, type: "video" | "audio" | "image", url: string, isOwn: boolean = false) {
		if (this.getItemById(id)) return;

		this.addItem({ id, name, type, url, duration: 0, isDownloading: true, isRemote: !isOwn });

		if (type === "image") {
			let img: HTMLImageElement | null = document.createElement("img");
			img.crossOrigin = "anonymous";
			img.src = url;

			const cleanupImg = () => {
				if (!img) return;
				img.onload = null;
				img.onerror = null;
				img.src = "";
				img = null;
			};

			const timeoutId = setTimeout(() => {
				cleanupImg();
				this.updateItem(id, { duration: DEFAULT_IMAGE_DURATION, isDownloading: false, downloadError: "Download timeout" });
			}, MEDIA_LOAD_TIMEOUT);

			img.onload = () => {
				clearTimeout(timeoutId);
				if (!img) return;
				const thumbnail = generateThumbnail(img, img.naturalWidth, img.naturalHeight);
				this.updateItem(id, {
					duration: DEFAULT_IMAGE_DURATION,
					width: img.naturalWidth,
					height: img.naturalHeight,
					thumbnail,
					isDownloading: false,
				});
				cleanupImg();
			};
			img.onerror = () => {
				clearTimeout(timeoutId);
				cleanupImg();
				this.updateItem(id, { duration: DEFAULT_IMAGE_DURATION, isDownloading: false });
			};
		} else if (type === "video") {
			let video: HTMLVideoElement | null = document.createElement("video");
			video.crossOrigin = "anonymous";
			video.preload = "metadata";
			video.src = url;

			const cleanupVideo = () => {
				if (!video) return;
				video.onloadedmetadata = null;
				video.onseeked = null;
				video.onerror = null;
				video.pause();
				video.src = "";
				video.load();
				video = null;
			};

			const timeoutId = setTimeout(() => {
				cleanupVideo();
				this.updateItem(id, { duration: 5, isDownloading: false, downloadError: "Download timeout" });
			}, MEDIA_LOAD_TIMEOUT);

			video.onloadedmetadata = () => {
				if (!video) return;
				const width = video.videoWidth;
				const height = video.videoHeight;
				const duration = video.duration;
				video.currentTime = 0.1;
				video.onseeked = () => {
					clearTimeout(timeoutId);
					if (!video) return;
					const thumbnail = generateThumbnail(video, width, height);
					this.updateItem(id, { duration, width, height, thumbnail, isDownloading: false });
					cleanupVideo();
				};
			};
			video.onerror = () => {
				clearTimeout(timeoutId);
				cleanupVideo();
				this.updateItem(id, { duration: 5, isDownloading: false });
			};
		} else {
			let audio: HTMLAudioElement | null = document.createElement("audio");
			audio.preload = "metadata";
			audio.src = url;

			const cleanupAudio = () => {
				if (!audio) return;
				audio.onloadedmetadata = null;
				audio.onerror = null;
				audio.pause();
				audio.src = "";
				audio.load();
				audio = null;
			};

			const timeoutId = setTimeout(() => {
				cleanupAudio();
				this.updateItem(id, { duration: 5, isDownloading: false, downloadError: "Download timeout" });
			}, MEDIA_LOAD_TIMEOUT);

			audio.onloadedmetadata = () => {
				clearTimeout(timeoutId);
				if (!audio) return;
				const duration = audio.duration;
				cleanupAudio();
				this.updateItem(id, { duration, isDownloading: false });
			};
			audio.onerror = () => {
				clearTimeout(timeoutId);
				cleanupAudio();
				this.updateItem(id, { duration: 5, isDownloading: false });
			};
		}
	}

	cleanup() {
		this.items.forEach((item) => {
			if (item.url.startsWith("blob:")) {
				URL.revokeObjectURL(item.url);
			}
			if (item.thumbnail && item.thumbnail.startsWith("blob:")) {
				URL.revokeObjectURL(item.thumbnail);
			}
		});
		this.items = [];
		this.notify();
	}
}

export const mediaStore = new MediaStore();
export { generateThumbnail, DEFAULT_IMAGE_DURATION };
export type { MediaItem };
