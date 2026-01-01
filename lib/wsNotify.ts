export interface WsNotifyPayload {
	lobbyId?: string;
	userId?: string;
	action?: string;
	[key: string]: unknown;
}

const WS_NOTIFY_TIMEOUT_MS = 500;

export function notifyWsServer(endpoint: string, payload?: WsNotifyPayload): void {
	const wsServerUrl = process.env.WS_SERVER_URL;
	const wsApiKey = process.env.WS_API_KEY;

	if (!wsServerUrl) {
		console.warn(`[WS Notify] WS_SERVER_URL not configured, skipping notification to ${endpoint}`);
		return;
	}

	if (!wsApiKey) {
		console.warn(`[WS Notify] WS_API_KEY not configured, skipping notification to ${endpoint}`);
		return;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), WS_NOTIFY_TIMEOUT_MS);

	const headers: Record<string, string> = {
		Authorization: `Bearer ${wsApiKey}`,
	};
	if (payload) {
		headers["Content-Type"] = "application/json";
	}

	(async () => {
		const fullUrl = `${wsServerUrl}${endpoint}`;
		try {
			const response = await fetch(fullUrl, {
				method: "POST",
				headers,
				body: payload ? JSON.stringify(payload) : undefined,
				signal: controller.signal,
			});

			if (!response.ok) {
				const text = await response.text();
				try {
					const data = JSON.parse(text);
					console.warn(`[WS Notify] HTTP ${response.status} from ${endpoint}:`, data.error);
				} catch {
					console.warn(`[WS Notify] HTTP ${response.status} from ${endpoint}. Body: ${text}`);
				}
			}
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				console.warn(`[WS Notify] Request timed out for ${endpoint}:`, payload);
			} else {
				console.warn(`[WS Notify] Failed to notify ${endpoint}:`, error);
			}
		} finally {
			clearTimeout(timeoutId);
		}
	})();
}


