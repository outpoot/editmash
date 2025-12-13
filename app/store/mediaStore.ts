interface MediaItem {
	id: string;
	name: string;
	type: "video" | "audio";
	url: string;
	duration: number;
	thumbnail?: string;
	width?: number;
	height?: number;
	fileId?: string;
	isUploading?: boolean;
	uploadProgress?: number;
	uploadError?: string;
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

	getItems() {
		return [...this.items];
	}

	getItemById(id: string) {
		return this.items.find((item) => item.id === id);
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
export type { MediaItem };
