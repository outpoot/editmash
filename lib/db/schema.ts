import { pgTable, text, timestamp, jsonb, integer, boolean, real, uuid, index, check, unique } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { MatchConfig } from "../../app/types/match";
import type { TimelineState } from "../../app/types/timeline";
import type { LobbyStatus } from "../../app/types/lobby";
import type { MatchStatus } from "../../app/types/match";

// Better auth tables

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	highlightColor: text("highlight_color").default("#3b82f6"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_userId_idx").on(table.userId)]
);

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	lobbyMemberships: many(lobbyPlayers),
	matchMemberships: many(matchPlayers),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export type UserRecord = typeof user.$inferSelect;
export type NewUserRecord = typeof user.$inferInsert;
export type SessionRecord = typeof session.$inferSelect;
export type AccountRecord = typeof account.$inferSelect;

// other tables

export const lobbies = pgTable("lobbies", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	joinCode: text("join_code").notNull().unique(),
	status: text("status").$type<LobbyStatus>().notNull().default("waiting"),
	hostPlayerId: text("host_player_id").notNull(),
	matchConfigJson: jsonb("match_config").$type<MatchConfig>().notNull(),
	matchId: uuid("match_id"),
	isSystemLobby: boolean("is_system_lobby").notNull().default(false),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const lobbyPlayers = pgTable(
	"lobby_players",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		lobbyId: uuid("lobby_id")
			.notNull()
			.references(() => lobbies.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		isHost: boolean("is_host").notNull().default(false),
		isReady: boolean("is_ready").notNull().default(false),
		joinedAt: timestamp("joined_at").notNull().defaultNow(),
	},
	(table) => [index("lobby_players_userId_idx").on(table.userId)]
);

export const matches = pgTable("matches", {
	id: uuid("id").primaryKey().defaultRandom(),
	lobbyId: uuid("lobby_id")
		.notNull()
		.references(() => lobbies.id),
	lobbyName: text("lobby_name").notNull(),
	status: text("status").$type<MatchStatus>().notNull().default("preparing"),
	configJson: jsonb("config").$type<MatchConfig>().notNull(),
	timelineJson: jsonb("timeline").$type<TimelineState>().notNull(),
	editCount: integer("edit_count").notNull().default(0),
	startedAt: timestamp("started_at"),
	endsAt: timestamp("ends_at"),
	completedAt: timestamp("completed_at"),
	renderJobId: text("render_job_id"),
	renderUrl: text("render_url"),
	renderError: text("render_error"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const matchPlayers = pgTable(
	"match_players",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		matchId: uuid("match_id")
			.notNull()
			.references(() => matches.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		joinedAt: timestamp("joined_at").notNull().defaultNow(),
		disconnectedAt: timestamp("disconnected_at"),
		clipCount: integer("clip_count").notNull().default(0),
	},
	(table) => [index("match_players_userId_idx").on(table.userId)]
);

export const matchMedia = pgTable(
	"match_media",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		matchId: uuid("match_id")
			.notNull()
			.references(() => matches.id, { onDelete: "cascade" }),
		uploadedBy: text("uploaded_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		type: text("type").$type<"video" | "audio" | "image">().notNull(),
		url: text("url").notNull(),
		fileId: text("file_id"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("match_media_matchId_idx").on(table.matchId),
		check("match_media_type_check", sql`${table.type} IN ('video', 'audio', 'image')`),
	]
);

export const clipEditOperations = pgTable("clip_edit_operations", {
	id: uuid("id").primaryKey().defaultRandom(),
	matchId: uuid("match_id")
		.notNull()
		.references(() => matches.id, { onDelete: "cascade" }),
	playerId: text("player_id").notNull(),
	operationType: text("operation_type").$type<"add" | "update" | "remove">().notNull(),
	clipId: text("clip_id").notNull(),
	trackId: text("track_id").notNull(),
	clipDataJson: jsonb("clip_data"),
	previousDataJson: jsonb("previous_data"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lobbiesRelations = relations(lobbies, ({ many, one }) => ({
	players: many(lobbyPlayers),
	match: one(matches, {
		fields: [lobbies.matchId],
		references: [matches.id],
	}),
}));

export const lobbyPlayersRelations = relations(lobbyPlayers, ({ one }) => ({
	lobby: one(lobbies, {
		fields: [lobbyPlayers.lobbyId],
		references: [lobbies.id],
	}),
	user: one(user, {
		fields: [lobbyPlayers.userId],
		references: [user.id],
	}),
}));

export const matchesRelations = relations(matches, ({ many, one }) => ({
	players: many(matchPlayers),
	media: many(matchMedia),
	editOperations: many(clipEditOperations),
	lobby: one(lobbies, {
		fields: [matches.lobbyId],
		references: [lobbies.id],
	}),
}));

export const matchPlayersRelations = relations(matchPlayers, ({ one }) => ({
	match: one(matches, {
		fields: [matchPlayers.matchId],
		references: [matches.id],
	}),
	user: one(user, {
		fields: [matchPlayers.userId],
		references: [user.id],
	}),
}));

export const matchMediaRelations = relations(matchMedia, ({ one }) => ({
	match: one(matches, {
		fields: [matchMedia.matchId],
		references: [matches.id],
	}),
	uploader: one(user, {
		fields: [matchMedia.uploadedBy],
		references: [user.id],
	}),
}));

export const clipEditOperationsRelations = relations(clipEditOperations, ({ one }) => ({
	match: one(matches, {
		fields: [clipEditOperations.matchId],
		references: [matches.id],
	}),
}));

export const videoLikes = pgTable(
	"video_likes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		matchId: uuid("match_id")
			.notNull()
			.references(() => matches.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("video_likes_matchId_idx").on(table.matchId),
		index("video_likes_userId_idx").on(table.userId),
		unique("video_likes_unique_idx").on(table.matchId, table.userId),
	]
);

export const videoLikesRelations = relations(videoLikes, ({ one }) => ({
	match: one(matches, {
		fields: [videoLikes.matchId],
		references: [matches.id],
	}),
	user: one(user, {
		fields: [videoLikes.userId],
		references: [user.id],
	}),
}));

export type VideoLikeRecord = typeof videoLikes.$inferSelect;
export type NewVideoLikeRecord = typeof videoLikes.$inferInsert;

export type LobbyRecord = typeof lobbies.$inferSelect;
export type NewLobbyRecord = typeof lobbies.$inferInsert;

export type LobbyPlayerRecord = typeof lobbyPlayers.$inferSelect;
export type NewLobbyPlayerRecord = typeof lobbyPlayers.$inferInsert;

export type MatchRecord = typeof matches.$inferSelect;
export type NewMatchRecord = typeof matches.$inferInsert;

export type MatchPlayerRecord = typeof matchPlayers.$inferSelect;
export type NewMatchPlayerRecord = typeof matchPlayers.$inferInsert;

export type ClipEditOperationRecord = typeof clipEditOperations.$inferSelect;
export type NewClipEditOperationRecord = typeof clipEditOperations.$inferInsert;

export type MatchMediaRecord = typeof matchMedia.$inferSelect;
export type NewMatchMediaRecord = typeof matchMedia.$inferInsert;
