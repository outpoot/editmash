import { ViewSettings } from "../components/TopBar";

type Listener = () => void;

const STORAGE_KEY = "editmash_view_settings";

const defaultSettings: ViewSettings = {
	showShineEffect: true,
	showChat: true,
	chatPosition: "bottom-left",
	showRemoteSelections: true,
	showRemoteClipNotifications: true,
	interleaveTracks: false,
};

class ViewSettingsStore {
	private settings: ViewSettings;
	private listeners: Set<Listener> = new Set();

	constructor() {
		this.settings = this.loadSettings();
	}

	private loadSettings(): ViewSettings {
		if (typeof window === "undefined") {
			return { ...defaultSettings };
		}

		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				return { ...defaultSettings, ...parsed };
			}
		} catch (error) {
			console.error("Failed to load view settings from localStorage:", error);
		}

		return { ...defaultSettings };
	}

	private saveSettings() {
		if (typeof window === "undefined") return;

		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
		} catch (error) {
			console.error("Failed to save view settings to localStorage:", error);
		}
	}

	subscribe(listener: Listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify() {
		this.listeners.forEach((listener) => listener());
	}

	getSettings() {
		return this.settings;
	}

	setSettings(settings: ViewSettings) {
		this.settings = settings;
		this.saveSettings();
		this.notify();
	}

	updateSetting<K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) {
		this.settings = { ...this.settings, [key]: value };
		this.saveSettings();
		this.notify();
	}
}

export const viewSettingsStore = new ViewSettingsStore();
