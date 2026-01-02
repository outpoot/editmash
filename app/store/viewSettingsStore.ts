import { ViewSettings } from "../components/TopBar";

type Listener = () => void;

class ViewSettingsStore {
	private settings: ViewSettings = {
		showShineEffect: true,
		showChat: true,
		chatPosition: "bottom-left",
		showRemoteSelections: true,
		showRemoteClipNotifications: true,
	};
	private listeners: Set<Listener> = new Set();

	subscribe(listener: Listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify() {
		this.listeners.forEach((listener) => listener());
	}

	getSettings() {
		return this.settings;
	}

	setSettings(settings: ViewSettings) {
		this.settings = settings;
		this.notify();
	}

	updateSetting<K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) {
		this.settings = { ...this.settings, [key]: value };
		this.notify();
	}
}

export const viewSettingsStore = new ViewSettingsStore();
