import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db, lobbies, lobbyPlayers, matches, matchPlayers, clipEditOperations, user, matchMedia } from "./db";
import type { Lobby, LobbyPlayer, LobbyStatus, LobbyListItemWithConfig } from "../app/types/lobby";
import type { Match, MatchStatus, MatchConfig, ClipEditOperation } from "../app/types/match";
import type { TimelineState, Clip, Track } from "../app/types/timeline";
import { DEFAULT_MATCH_CONFIG } from "../app/types/match";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SYSTEM_LOBBY_PRESETS: { name: string; config: MatchConfig }[] = [
	{
		name: "Quick Chaos",
		config: {
			timelineDuration: 15,
			matchDuration: 2,
			maxPlayers: 100,
			clipSizeMin: 0.1,
			clipSizeMax: 15,
			audioMaxDb: 6,
			maxVideoTracks: 30,
			maxAudioTracks: 30,
			maxClipsPerUser: 0, // unlimited
			constraints: [],
		},
	},
	{
		name: "Precision Cut",
		config: {
			timelineDuration: 30,
			matchDuration: 5,
			maxPlayers: 50,
			clipSizeMin: 1,
			clipSizeMax: 5,
			audioMaxDb: 0,
			maxVideoTracks: 10,
			maxAudioTracks: 10,
			maxClipsPerUser: 5,
			constraints: [],
		},
	},
	{
		name: "Spotify Premium",
		config: {
			timelineDuration: 60,
			matchDuration: 10,
			maxPlayers: 200,
			clipSizeMin: 0.5,
			clipSizeMax: 10,
			audioMaxDb: 4,
			maxVideoTracks: 50,
			maxAudioTracks: 50,
			maxClipsPerUser: 10,
			constraints: [],
		},
	},
	{
		name: "Speed Run",
		config: {
			timelineDuration: 5,
			matchDuration: 1,
			maxPlayers: 75,
			clipSizeMin: 0.1,
			clipSizeMax: 2,
			audioMaxDb: 4,
			maxVideoTracks: 20,
			maxAudioTracks: 20,
			maxClipsPerUser: 3,
			constraints: [],
		},
	},
	{
		name: "Layer Madness",
		config: {
			timelineDuration: 30,
			matchDuration: 3,
			maxPlayers: 150,
			clipSizeMin: 0.5,
			clipSizeMax: 30,
			audioMaxDb: 6,
			maxVideoTracks: 100,
			maxAudioTracks: 100,
			maxClipsPerUser: 0, // unlimited
			constraints: [],
		},
	},
];

function isValidUUID(str: string): boolean {
	return UUID_REGEX.test(str);
}

function generateJoinCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
}

function getRandomSystemLobbyPreset(): { name: string; config: MatchConfig } {
	return SYSTEM_LOBBY_PRESETS[Math.floor(Math.random() * SYSTEM_LOBBY_PRESETS.length)];
}

export async function createLobby(
	name: string,
	matchConfig: MatchConfig,
	hostUserId: string,
	isSystemLobby: boolean = false
): Promise<{ lobbyId: string; joinCode: string }> {
	const database = db();
	const joinCode = generateJoinCode();

	const [lobby] = await database
		.insert(lobbies)
		.values({
			name,
			joinCode,
			status: "waiting",
			hostPlayerId: hostUserId,
			matchConfigJson: matchConfig,
			isSystemLobby,
		})
		.returning({ id: lobbies.id, joinCode: lobbies.joinCode });

	if (!isSystemLobby) {
		await database.insert(lobbyPlayers).values({
			lobbyId: lobby.id,
			userId: hostUserId,
			isHost: true,
			isReady: true,
		});
	}

	return { lobbyId: lobby.id, joinCode: lobby.joinCode };
}

export async function getLobbyById(lobbyId: string): Promise<Lobby | null> {
	if (!isValidUUID(lobbyId)) {
		return null;
	}

	const database = db();

	const [lobbyRecord] = await database.select().from(lobbies).where(eq(lobbies.id, lobbyId)).limit(1);

	if (!lobbyRecord) {
		return null;
	}

	const playersWithUsers = await database
		.select({
			id: lobbyPlayers.id,
			lobbyId: lobbyPlayers.lobbyId,
			userId: lobbyPlayers.userId,
			isHost: lobbyPlayers.isHost,
			isReady: lobbyPlayers.isReady,
			joinedAt: lobbyPlayers.joinedAt,
			userName: user.name,
			userImage: user.image,
		})
		.from(lobbyPlayers)
		.innerJoin(user, eq(lobbyPlayers.userId, user.id))
		.where(eq(lobbyPlayers.lobbyId, lobbyId));

	return mapLobbyRecordToLobby(lobbyRecord, playersWithUsers);
}

export async function getLobbyByJoinCode(joinCode: string): Promise<Lobby | null> {
	const database = db();

	const [lobbyRecord] = await database.select().from(lobbies).where(eq(lobbies.joinCode, joinCode.toUpperCase())).limit(1);

	if (!lobbyRecord) {
		return null;
	}

	const playersWithUsers = await database
		.select({
			id: lobbyPlayers.id,
			lobbyId: lobbyPlayers.lobbyId,
			userId: lobbyPlayers.userId,
			isHost: lobbyPlayers.isHost,
			isReady: lobbyPlayers.isReady,
			joinedAt: lobbyPlayers.joinedAt,
			userName: user.name,
			userImage: user.image,
		})
		.from(lobbyPlayers)
		.innerJoin(user, eq(lobbyPlayers.userId, user.id))
		.where(eq(lobbyPlayers.lobbyId, lobbyRecord.id));

	return mapLobbyRecordToLobby(lobbyRecord, playersWithUsers);
}

export async function listLobbies(status?: LobbyStatus): Promise<LobbyListItemWithConfig[]> {
	const database = db();

	let query = database.select().from(lobbies).orderBy(desc(lobbies.createdAt));

	if (status) {
		query = query.where(eq(lobbies.status, status)) as typeof query;
	}

	const lobbyRecords = await query;

	const result: LobbyListItemWithConfig[] = [];

	for (const record of lobbyRecords) {
		const playersWithUsers = await database
			.select({
				id: lobbyPlayers.id,
				lobbyId: lobbyPlayers.lobbyId,
				userId: lobbyPlayers.userId,
				isHost: lobbyPlayers.isHost,
				isReady: lobbyPlayers.isReady,
				joinedAt: lobbyPlayers.joinedAt,
				userName: user.name,
				userImage: user.image,
			})
			.from(lobbyPlayers)
			.innerJoin(user, eq(lobbyPlayers.userId, user.id))
			.where(eq(lobbyPlayers.lobbyId, record.id));

		const host = playersWithUsers.find((p) => p.isHost);

		let matchEndsAt: Date | null = null;
		if (record.matchId && (record.status === "in_match" || record.status === "starting")) {
			const [matchRecord] = await database
				.select({ endsAt: matches.endsAt })
				.from(matches)
				.where(eq(matches.id, record.matchId))
				.limit(1);
			matchEndsAt = matchRecord?.endsAt ?? null;
		}

		result.push({
			id: record.id,
			name: record.name,
			joinCode: record.joinCode,
			status: record.status,
			playerCount: playersWithUsers.length,
			maxPlayers: record.matchConfigJson.maxPlayers,
			hostUsername: host?.userName || (record.isSystemLobby ? "System" : "Unknown"),
			isSystemLobby: record.isSystemLobby,
			createdAt: record.createdAt,
			matchConfig: record.matchConfigJson as MatchConfig,
			players: playersWithUsers.map((p) => ({
				id: p.userId,
				username: p.userName || "Unknown",
				image: p.userImage,
			})),
			matchEndsAt,
		});
	}

	return result;
}

export async function getPlayerActiveLobby(userId: string): Promise<{ lobbyId: string; lobbyName: string } | null> {
	const database = db();

	const result = await database
		.select({
			lobbyId: lobbyPlayers.lobbyId,
			lobbyName: lobbies.name,
		})
		.from(lobbyPlayers)
		.innerJoin(lobbies, eq(lobbyPlayers.lobbyId, lobbies.id))
		.where(
			and(
				eq(lobbyPlayers.userId, userId),
				inArray(lobbies.status, ['waiting', 'starting', 'in_match'])
			)
		)
		.limit(1);

	if (result.length === 0) {
		return null;
	}

	return {
		lobbyId: result[0].lobbyId,
		lobbyName: result[0].lobbyName,
	};
}

export async function addPlayerToLobby(lobbyId: string, userId: string): Promise<{ success: boolean; message: string; activeLobby?: { lobbyId: string; lobbyName: string } }> {
	const database = db();

	const existingLobby = await getPlayerActiveLobby(userId);
	if (existingLobby && existingLobby.lobbyId !== lobbyId) {
		return { 
			success: false, 
			message: `You are already in lobby "${existingLobby.lobbyName}". Leave it first to join another.`,
			activeLobby: existingLobby
		};
	}

	const lobby = await getLobbyById(lobbyId);
	if (!lobby) {
		return { success: false, message: "Lobby not found" };
	}

	if (lobby.status === "closed") {
		return { success: false, message: "Lobby is closed" };
	}

	if (lobby.players.length >= lobby.matchConfig.maxPlayers) {
		return { success: false, message: "Lobby is full" };
	}

	const existingPlayer = lobby.players.find((p) => p.id === userId);
	if (existingPlayer) {
		return { success: false, message: "Player already in lobby" };
	}

	const isFirstPlayerInSystemLobby = await isSystemLobbyEmpty(lobbyId);
	
	await database.insert(lobbyPlayers).values({
		lobbyId,
		userId,
		isHost: isFirstPlayerInSystemLobby,
		isReady: isFirstPlayerInSystemLobby,
	});

	if (isFirstPlayerInSystemLobby) {
		await database
			.update(lobbies)
			.set({ hostPlayerId: userId, updatedAt: new Date() })
			.where(eq(lobbies.id, lobbyId));
	}

	return { success: true, message: "Successfully joined lobby" };
}

async function isSystemLobbyEmpty(lobbyId: string): Promise<boolean> {
	const database = db();
	
	const [lobbyRecord] = await database
		.select({ isSystemLobby: lobbies.isSystemLobby })
		.from(lobbies)
		.where(eq(lobbies.id, lobbyId))
		.limit(1);
	
	if (!lobbyRecord?.isSystemLobby) {
		return false;
	}
	
	const players = await database
		.select({ id: lobbyPlayers.id })
		.from(lobbyPlayers)
		.where(eq(lobbyPlayers.lobbyId, lobbyId))
		.limit(1);
	
	return players.length === 0;
}

export async function ensureSystemLobbiesExist(): Promise<void> {
	const database = db();
	const SYSTEM_USER_ID = "system";
	const TARGET_COUNT = 3;

	const existingSystemLobbies = await database
		.select()
		.from(lobbies)
		.where(and(eq(lobbies.isSystemLobby, true), eq(lobbies.status, "waiting")));

	const needed = TARGET_COUNT - existingSystemLobbies.length;

	for (let i = 0; i < needed; i++) {
		const preset = getRandomSystemLobbyPreset();
		await createLobby(preset.name, preset.config, SYSTEM_USER_ID, true);
	}

	if (needed > 0) {
		console.log(`[System] Created ${needed} system lobbies`);
	}
}

export async function removePlayerFromLobby(lobbyId: string, userId: string): Promise<{ success: boolean; message: string }> {
	const database = db();

	const lobby = await getLobbyById(lobbyId);
	if (!lobby) {
		return { success: false, message: "Lobby not found" };
	}

	const player = lobby.players.find((p) => p.id === userId);
	if (!player) {
		return { success: false, message: "Player not in lobby" };
	}

	await database.delete(lobbyPlayers).where(and(eq(lobbyPlayers.lobbyId, lobbyId), eq(lobbyPlayers.userId, userId)));

	// host left, assign new host or close lobby
	if (player.isHost) {
		const remainingPlayers = lobby.players.filter((p) => p.id !== userId);
		if (remainingPlayers.length > 0) {
			const newHostId = remainingPlayers[0].id;
			await database
				.update(lobbyPlayers)
				.set({ isHost: true })
				.where(and(eq(lobbyPlayers.lobbyId, lobbyId), eq(lobbyPlayers.userId, newHostId)));
			await database
				.update(lobbies)
				.set({ hostPlayerId: newHostId, updatedAt: new Date() })
				.where(eq(lobbies.id, lobbyId));
		} else if (lobby.status === "waiting") {
			await database.update(lobbies).set({ status: "closed", updatedAt: new Date() }).where(eq(lobbies.id, lobbyId));
		}
	}

	return { success: true, message: "Successfully left lobby" };
}

export async function updateLobbyStatus(lobbyId: string, status: LobbyStatus, matchId?: string): Promise<void> {
	const database = db();

	await database
		.update(lobbies)
		.set({
			status,
			matchId: matchId ?? null,
			updatedAt: new Date(),
		})
		.where(eq(lobbies.id, lobbyId));
}

export async function clearSystemLobbyFlag(lobbyId: string): Promise<void> {
	const database = db();

	await database
		.update(lobbies)
		.set({
			isSystemLobby: false,
			updatedAt: new Date(),
		})
		.where(eq(lobbies.id, lobbyId));
}

export async function cleanupStaleMatches(): Promise<number> {
	const database = db();

	const staleLobbies = await database
		.select({ id: lobbies.id, matchId: lobbies.matchId })
		.from(lobbies)
		.where(eq(lobbies.status, "in_match"));

	let cleanedCount = 0;
	for (const lobby of staleLobbies) {
		if (lobby.matchId) {
			const [match] = await database
				.select({ status: matches.status, endsAt: matches.endsAt })
				.from(matches)
				.where(eq(matches.id, lobby.matchId));

			if (match) {
				const now = new Date();
				const shouldClose = 
					match.status === "completed" || 
					match.status === "rendering" ||
					match.status === "failed" ||
					(match.endsAt && now > match.endsAt);

				if (shouldClose) {
					await database
						.update(lobbies)
						.set({ status: "closed", updatedAt: new Date() })
						.where(eq(lobbies.id, lobby.id));
					cleanedCount++;
				}
			}
		} else {
			await database
				.update(lobbies)
				.set({ status: "closed", updatedAt: new Date() })
				.where(eq(lobbies.id, lobby.id));
			cleanedCount++;
		}
	}

	return cleanedCount;
}

export async function setPlayerReady(lobbyId: string, userId: string, ready: boolean): Promise<void> {
	const database = db();

	await database
		.update(lobbyPlayers)
		.set({ isReady: ready })
		.where(and(eq(lobbyPlayers.lobbyId, lobbyId), eq(lobbyPlayers.userId, userId)));
}

// Match functions

export async function createMatch(lobbyId: string, lobbyName: string, config: MatchConfig, players: LobbyPlayer[]): Promise<string> {
	const database = db();

	const tracks: Track[] = [];
	for (let i = 0; i < config.maxVideoTracks; i++) {
		tracks.push({
			id: `video-${i}`,
			type: "video",
			clips: [],
		});
	}
	for (let i = 0; i < config.maxAudioTracks; i++) {
		tracks.push({
			id: `audio-${i}`,
			type: "audio",
			clips: [],
		});
	}

	const emptyTimeline: TimelineState = {
		duration: config.timelineDuration,
		tracks,
	};

	const [match] = await database
		.insert(matches)
		.values({
			lobbyId,
			lobbyName,
			status: "preparing",
			configJson: config,
			timelineJson: emptyTimeline,
			editCount: 0,
		})
		.returning({ id: matches.id });

	for (const player of players) {
		await database.insert(matchPlayers).values({
			matchId: match.id,
			userId: player.id,
			clipCount: 0,
		});
	}

	return match.id;
}

export async function deleteMatch(matchId: string): Promise<void> {
	const database = db();
	await database.delete(matches).where(eq(matches.id, matchId));
}

export async function getMatchById(matchId: string): Promise<Match | null> {
	const database = db();

	const [matchRecord] = await database.select().from(matches).where(eq(matches.id, matchId)).limit(1);

	if (!matchRecord) {
		return null;
	}

	const playersWithUsers = await database
		.select({
			id: matchPlayers.id,
			matchId: matchPlayers.matchId,
			userId: matchPlayers.userId,
			joinedAt: matchPlayers.joinedAt,
			disconnectedAt: matchPlayers.disconnectedAt,
			clipCount: matchPlayers.clipCount,
			userName: user.name,
			userImage: user.image,
		})
		.from(matchPlayers)
		.innerJoin(user, eq(matchPlayers.userId, user.id))
		.where(eq(matchPlayers.matchId, matchId));

	return mapMatchRecordToMatch(matchRecord, playersWithUsers);
}

export async function getMatchByLobbyId(lobbyId: string): Promise<Match | null> {
	const database = db();

	const [matchRecord] = await database.select().from(matches).where(eq(matches.lobbyId, lobbyId)).limit(1);

	if (!matchRecord) {
		return null;
	}

	const playersWithUsers = await database
		.select({
			id: matchPlayers.id,
			matchId: matchPlayers.matchId,
			userId: matchPlayers.userId,
			joinedAt: matchPlayers.joinedAt,
			disconnectedAt: matchPlayers.disconnectedAt,
			clipCount: matchPlayers.clipCount,
			userName: user.name,
			userImage: user.image,
		})
		.from(matchPlayers)
		.innerJoin(user, eq(matchPlayers.userId, user.id))
		.where(eq(matchPlayers.matchId, matchRecord.id));

	return mapMatchRecordToMatch(matchRecord, playersWithUsers);
}

export async function updateMatchStatus(matchId: string, status: MatchStatus): Promise<void> {
	const database = db();

	const updates: Record<string, unknown> = {
		status,
		updatedAt: new Date(),
	};

	if (status === "active") {
		const match = await getMatchById(matchId);
		if (match) {
			updates.startedAt = new Date();
			updates.endsAt = new Date(Date.now() + match.config.matchDuration * 60 * 1000);
		}
	} else if (status === "completed" || status === "failed") {
		updates.completedAt = new Date();
	}

	await database.update(matches).set(updates).where(eq(matches.id, matchId));
}

export async function updateMatchTimeline(matchId: string, timeline: TimelineState): Promise<void> {
	const database = db();

	await database.update(matches).set({ timelineJson: timeline, updatedAt: new Date() }).where(eq(matches.id, matchId));
}

export async function updateMatchRender(matchId: string, renderJobId?: string, renderUrl?: string, renderError?: string): Promise<void> {
	const database = db();

	await database
		.update(matches)
		.set({
			renderJobId: renderJobId ?? null,
			renderUrl: renderUrl ?? null,
			renderError: renderError ?? null,
			updatedAt: new Date(),
		})
		.where(eq(matches.id, matchId));
}

export async function markPlayerDisconnected(matchId: string, userId: string): Promise<void> {
	const database = db();

	await database
		.update(matchPlayers)
		.set({ disconnectedAt: new Date() })
		.where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)));
}

export async function getPlayerActiveMatch(userId: string): Promise<{ matchId: string; lobbyName: string } | null> {
	const database = db();

	const result = await database
		.select({
			matchId: matchPlayers.matchId,
			lobbyName: matches.lobbyName,
			matchStatus: matches.status,
		})
		.from(matchPlayers)
		.innerJoin(matches, eq(matchPlayers.matchId, matches.id))
		.where(
			and(
				eq(matchPlayers.userId, userId),
				// Player hasn't left the match
				sql`${matchPlayers.disconnectedAt} IS NULL`,
				// Match is still active (not completed/failed)
				sql`${matches.status} IN ('preparing', 'active')`
			)
		)
		.limit(1);

	if (result.length === 0) {
		return null;
	}

	return {
		matchId: result[0].matchId,
		lobbyName: result[0].lobbyName,
	};
}

export async function incrementPlayerClipCount(matchId: string, userId: string, delta: number = 1): Promise<void> {
	const database = db();

	const [player] = await database
		.select()
		.from(matchPlayers)
		.where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)))
		.limit(1);

	if (player) {
		await database
			.update(matchPlayers)
			.set({ clipCount: player.clipCount + delta })
			.where(eq(matchPlayers.id, player.id));
	}
}

// Clip edit functions
export async function recordClipEdit(
	matchId: string,
	playerId: string,
	operationType: "add" | "update" | "remove",
	clipId: string,
	trackId: string,
	clipData: Clip | null,
	previousData: Clip | null
): Promise<void> {
	const database = db();

	await database.insert(clipEditOperations).values({
		matchId,
		playerId,
		operationType,
		clipId,
		trackId,
		clipDataJson: clipData,
		previousDataJson: previousData,
	});
}

export async function getMatchEditHistory(matchId: string): Promise<ClipEditOperation[]> {
	const database = db();

	const records = await database
		.select()
		.from(clipEditOperations)
		.where(eq(clipEditOperations.matchId, matchId))
		.orderBy(desc(clipEditOperations.createdAt));

	return records.map((r) => ({
		id: r.id,
		matchId: r.matchId,
		playerId: r.playerId,
		type: r.operationType,
		clipId: r.clipId,
		trackId: r.trackId,
		clipData: r.clipDataJson as Clip | null,
		previousData: r.previousDataJson as Clip | null,
		timestamp: r.createdAt,
	}));
}

// other functions

type LobbyPlayerWithUser = {
	id: string;
	lobbyId: string;
	userId: string;
	isHost: boolean;
	isReady: boolean;
	joinedAt: Date;
	userName: string;
	userImage: string | null;
};

function mapLobbyRecordToLobby(
	record: {
		id: string;
		name: string;
		joinCode: string;
		status: LobbyStatus;
		hostPlayerId: string;
		matchConfigJson: MatchConfig;
		matchId: string | null;
		isSystemLobby: boolean;
		createdAt: Date;
		updatedAt: Date;
	},
	players: LobbyPlayerWithUser[]
): Lobby {
	return {
		id: record.id,
		name: record.name,
		joinCode: record.joinCode,
		status: record.status,
		hostPlayerId: record.hostPlayerId,
		matchConfig: record.matchConfigJson,
		players: players.map((p) => ({
			id: p.userId,
			username: p.userName,
			image: p.userImage,
			joinedAt: p.joinedAt,
			isHost: p.isHost,
			isReady: p.isReady,
		})),
		matchId: record.matchId,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

type MatchPlayerWithUser = {
	id: string;
	matchId: string;
	userId: string;
	joinedAt: Date;
	disconnectedAt: Date | null;
	clipCount: number;
	userName: string;
	userImage: string | null;
};

function mapMatchRecordToMatch(
	record: {
		id: string;
		lobbyId: string;
		lobbyName: string;
		status: MatchStatus;
		configJson: MatchConfig;
		timelineJson: TimelineState;
		editCount: number;
		startedAt: Date | null;
		endsAt: Date | null;
		completedAt: Date | null;
		renderJobId: string | null;
		renderUrl: string | null;
		renderError: string | null;
		createdAt: Date;
		updatedAt: Date;
	},
	players: MatchPlayerWithUser[]
): Match {
	return {
		id: record.id,
		lobbyId: record.lobbyId,
		lobbyName: record.lobbyName,
		status: record.status,
		config: record.configJson,
		timeline: record.timelineJson,
		editCount: record.editCount,
		players: players.map((p) => ({
			id: p.userId,
			username: p.userName,
			image: p.userImage,
			joinedAt: p.joinedAt,
			disconnectedAt: p.disconnectedAt,
			clipCount: p.clipCount,
		})),
		startedAt: record.startedAt,
		endsAt: record.endsAt,
		completedAt: record.completedAt,
		renderJobId: record.renderJobId,
		renderUrl: record.renderUrl,
		renderError: record.renderError,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

// Cleanup functions

export async function deleteMatchMedia(matchId: string): Promise<void> {
	const database = db();
	await database.delete(matchMedia).where(eq(matchMedia.matchId, matchId));
}

export async function cleanupOldLobbies(olderThanHours: number = 24): Promise<number> {
	const database = db();
	const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

	const result = await database.delete(lobbies).where(and(eq(lobbies.status, "closed"), eq(lobbies.createdAt, cutoff)));

	return 0;
}

export async function getExpiredMatches(): Promise<Match[]> {
	const database = db();
	const now = new Date();

	const records = await database.select().from(matches).where(eq(matches.status, "active"));

	const expiredMatches: Match[] = [];

	for (const record of records) {
		if (record.endsAt && record.endsAt <= now) {
			const playersWithUsers = await database
				.select({
					id: matchPlayers.id,
					matchId: matchPlayers.matchId,
					userId: matchPlayers.userId,
					joinedAt: matchPlayers.joinedAt,
					disconnectedAt: matchPlayers.disconnectedAt,
					clipCount: matchPlayers.clipCount,
					userName: user.name,
					userImage: user.image,
				})
				.from(matchPlayers)
				.innerJoin(user, eq(matchPlayers.userId, user.id))
				.where(eq(matchPlayers.matchId, record.id));
			expiredMatches.push(mapMatchRecordToMatch(record, playersWithUsers));
		}
	}

	return expiredMatches;
}
