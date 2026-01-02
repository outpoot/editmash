import { MatchStatus } from "../app/types/match";
import { validateMatchConfig } from "./clipConstraints";
import * as storage from "./storage";
import { renderTimeline, downloadMediaFiles, cleanupTempFiles } from "./ffmpeg";
import { uploadToB2 } from "./b2";
import { getRedis } from "./redis";
import { notifyWsServer } from "./wsNotify";
import path from "path";
import fs from "fs/promises";
import os from "os";

const matchTimers = new Map<string, NodeJS.Timeout>();

const LOBBY_LOCK_PREFIX = "lobby:lock:";
const LOBBY_LOCK_TTL = 30; // seconds

async function acquireLobbyLock(lobbyId: string): Promise<string | null> {
	const lockKey = `${LOBBY_LOCK_PREFIX}${lobbyId}`;
	const token = `${process.pid}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

	const result = await getRedis().set(lockKey, token, "EX", LOBBY_LOCK_TTL, "NX");

	if (result === "OK") {
		return token;
	}

	return null;
}

async function releaseLobbyLock(lobbyId: string, token: string): Promise<boolean> {
	const lockKey = `${LOBBY_LOCK_PREFIX}${lobbyId}`;

	const luaScript = `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("del", KEYS[1])
		else
			return 0
		end
	`;

	const result = await getRedis().eval(luaScript, 1, lockKey, token);
	return result === 1;
}

async function atomicLobbyStatusTransition(lobbyId: string): Promise<{ success: boolean; previousStatus?: string }> {
	const lockKey = `lobby:status:${lobbyId}`;

	const luaScript = `
		local current = redis.call("get", KEYS[1])
		if not current or current == "failed" then
			redis.call("set", KEYS[1], "starting", "EX", 10)
			return 1
		else
			return 0
		end
	`;

	const result = await getRedis().eval(luaScript, 1, lockKey, lobbyId);
	return { success: result === 1 };
}

async function clearLobbyStatusTransition(lobbyId: string): Promise<void> {
	const lockKey = `lobby:status:${lobbyId}`;
	await getRedis().del(lockKey);
}

export async function startMatchFromLobby(lobbyId: string): Promise<{ success: boolean; matchId?: string; message: string }> {
	const lockToken = await acquireLobbyLock(lobbyId);
	if (!lockToken) {
		return { success: false, message: "Another start operation is in progress for this lobby" };
	}

	try {
		const lobby = await storage.getLobbyById(lobbyId);
		if (!lobby) {
			return { success: false, message: "Lobby not found" };
		}

		if (lobby.status !== "waiting") {
			return { success: false, message: "Lobby is not in waiting state" };
		}

		await clearLobbyStatusTransition(lobbyId);

		const transition = await atomicLobbyStatusTransition(lobbyId);
		if (!transition.success) {
			return { success: false, message: "Lobby is already being started" };
		}

		if (lobby.players.length < 2) {
			await clearLobbyStatusTransition(lobbyId);
			return { success: false, message: "Need at least 2 players to start a match" };
		}

		const configValidation = validateMatchConfig(lobby.matchConfig);
		if (!configValidation.valid) {
			await clearLobbyStatusTransition(lobbyId);
			return { success: false, message: configValidation.reason || "Invalid match configuration" };
		}

		let createdMatchId: string | undefined;
		try {
			await storage.updateLobbyStatus(lobbyId, "starting");

			await storage.clearSystemLobbyFlag(lobbyId);

			createdMatchId = await storage.createMatch(lobbyId, lobby.name, lobby.matchConfig, lobby.players);

			await storage.updateLobbyStatus(lobbyId, "in_match", createdMatchId);
			await storage.updateMatchStatus(createdMatchId, "active");

			scheduleMatchCompletion(createdMatchId, lobby.matchConfig.matchDuration * 60);

			await clearLobbyStatusTransition(lobbyId);

			return { success: true, matchId: createdMatchId, message: "Match started successfully" };
		} catch (error) {
			console.error("Error starting match:", error);

			if (createdMatchId) {
				clearMatchTimer(createdMatchId);
				try {
					await storage.deleteMatch(createdMatchId);
					console.error(`Deleted orphaned match ${createdMatchId} after failure`);
				} catch (delErr) {
					console.error(`Failed to delete orphaned match ${createdMatchId}:`, delErr);
				}
			}

			try {
				await storage.updateLobbyStatus(lobbyId, "waiting");
			} catch (restoreErr) {
				console.error(`Failed to restore lobby ${lobbyId} to waiting after failed start:`, restoreErr);
			}

			await clearLobbyStatusTransition(lobbyId);

			return { success: false, message: "Failed to start match" };
		}
	} finally {
		try {
			await releaseLobbyLock(lobbyId, lockToken);
		} catch (error) {
			console.error(`Failed releasing lobby lock for lobby ${lobbyId}:`, error);
		}
	}
}

function scheduleMatchCompletion(matchId: string, durationSeconds: number): void {
	const existingTimer = matchTimers.get(matchId);
	if (existingTimer) {
		clearTimeout(existingTimer);
	}

	const timer = setTimeout(() => {
		completeMatch(matchId).catch((error) => {
			console.error(`[Match ${matchId}] Error completing match via timer:`, error);
		});
	}, durationSeconds * 1000);

	matchTimers.set(matchId, timer);
}

export function clearMatchTimer(matchId: string): void {
	const timer = matchTimers.get(matchId);
	if (timer) {
		clearTimeout(timer);
		matchTimers.delete(matchId);
	}
}

export async function completeMatch(matchId: string): Promise<{ success: boolean; message: string }> {
	const match = await storage.getMatchById(matchId);
	if (!match) {
		return { success: false, message: "Match not found" };
	}

	if (match.status !== "active") {
		return { success: false, message: "Match is not active" };
	}

	clearMatchTimer(matchId);

	try {
		await storage.updateMatchStatus(matchId, "rendering");

		notifyWsServer("/notify/match", { matchId, status: "rendering", timeRemaining: null });
		notifyWsServer("/notify/lobbies", { lobbyId: match.lobbyId, matchId, action: "match_completing" });

		triggerRender(matchId).catch((error) => {
			console.error(`[MatchManager] Background render failed for match ${matchId}:`, error);
		});

		return { success: true, message: "Match completing, render started" };
	} catch (error) {
		console.error("Error completing match:", error);
		await storage.updateMatchStatus(matchId, "failed");
		await storage.updateMatchRender(matchId, undefined, undefined, String(error));
		notifyWsServer("/notify/match", { matchId, status: "failed", timeRemaining: null });
		return { success: false, message: "Failed to complete match" };
	}
}

async function triggerRender(matchId: string): Promise<void> {
	const match = await storage.getMatchById(matchId);
	if (!match) {
		throw new Error("Match not found");
	}

	const mediaUrls: Record<string, string> = {};
	for (const track of match.timeline.tracks) {
		for (const clip of track.clips) {
			if (clip.src.startsWith("blob:")) {
				console.warn(`[Match ${matchId}] Skipping clip with blob URL: ${clip.id}`);
				continue;
			}
			if (!mediaUrls[clip.src]) {
				mediaUrls[clip.src] = clip.src;
			}
		}
	}

	const renderableTimeline = {
		...match.timeline,
		tracks: match.timeline.tracks.map(track => ({
			...track,
			clips: track.clips.filter(clip => !clip.src.startsWith("blob:"))
		}))
	};

	const outputDir = path.join(os.tmpdir(), "editmash", "renders");
	await fs.mkdir(outputDir, { recursive: true });
	const outputFileName = `render_${matchId}.mp4`;
	const outputPath = path.join(outputDir, outputFileName);

	if (Object.keys(mediaUrls).length === 0) {
		await renderTimeline(renderableTimeline, new Map(), outputPath);

		const outputBuffer = await fs.readFile(outputPath);
		const b2FileName = `renders/${outputFileName}`;
		const uploadedFile = await uploadToB2(outputBuffer, b2FileName, "video/mp4");
		
		const proxiedUrl = `/api/media/${encodeURIComponent(uploadedFile.fileName)}`;
		await storage.updateMatchRender(matchId, undefined, proxiedUrl);
		await storage.updateMatchStatus(matchId, "completed");

		await fs.unlink(outputPath).catch(() => {});

		await storage.deleteMatchMedia(matchId);
		return;
	}

	let fileMap: Map<string, string> | null = null;
	try {
		fileMap = await downloadMediaFiles(mediaUrls);

		await storage.updateMatchRender(matchId, matchId);

		await renderTimeline(renderableTimeline, fileMap, outputPath, (progress) => {
			console.log(`[Match ${matchId}] Render progress: ${progress.toFixed(1)}%`);
		});

		const outputBuffer = await fs.readFile(outputPath);
		const b2FileName = `renders/${outputFileName}`;
		const uploadedFile = await uploadToB2(outputBuffer, b2FileName, "video/mp4", (uploadProgress) => {
			console.log(`[Match ${matchId}] Upload progress: ${uploadProgress.toFixed(1)}%`);
		});

		const proxiedUrl = `/api/media/${encodeURIComponent(uploadedFile.fileName)}`;
		await storage.updateMatchRender(matchId, matchId, proxiedUrl);
		await storage.updateMatchStatus(matchId, "completed");

		await fs.unlink(outputPath).catch(() => {});

		await storage.deleteMatchMedia(matchId);

		await storage.updateLobbyStatus(match.lobbyId, "closed");
	} catch (error) {
		console.error(`[Match ${matchId}] Render failed:`, error);
		await storage.updateMatchRender(matchId, undefined, undefined, String(error));
		await storage.updateMatchStatus(matchId, "failed");
		await fs.unlink(outputPath).catch(() => {});
		throw error;
	} finally {
		if (fileMap) {
			await cleanupTempFiles(fileMap);
		}
	}
}

export async function getMatchStatus(
	matchId: string
): Promise<{ matchId: string; status: MatchStatus; timeRemaining: number | null; playerCount: number; clipCount: number } | null> {
	const match = await storage.getMatchById(matchId);
	if (!match) {
		return null;
	}

	let timeRemaining: number | null = null;
	if (match.status === "active" && match.endsAt) {
		timeRemaining = Math.max(0, (match.endsAt.getTime() - Date.now()) / 1000);
	}

	const clipCount = match.timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0);

	return {
		matchId: match.id,
		status: match.status,
		timeRemaining,
		playerCount: match.players.filter((p) => !p.disconnectedAt).length,
		clipCount,
	};
}

export async function handlePlayerDisconnect(matchId: string, playerId: string): Promise<void> {
	await storage.markPlayerDisconnected(matchId, playerId);
}

export async function checkExpiredMatches(): Promise<void> {
	const expiredMatches = await storage.getExpiredMatches();

	for (const match of expiredMatches) {
		console.log(`[MatchManager] Auto-completing expired match: ${match.id}`);
		try {
			await completeMatch(match.id);
		} catch (error) {
			console.error(`[MatchManager] Failed to auto-complete expired match ${match.id}:`, error);
		}
	}
}

export { storage };
