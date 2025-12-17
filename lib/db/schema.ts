import { pgTable, text, timestamp, jsonb, integer, boolean, real, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { MatchConfig } from "../../app/types/match";
import type { TimelineState } from "../../app/types/timeline";
import type { LobbyStatus } from "../../app/types/lobby";
import type { MatchStatus } from "../../app/types/match";

export const lobbies = pgTable("lobbies", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	joinCode: text("join_code").notNull().unique(),
	status: text("status").$type<LobbyStatus>().notNull().default("waiting"),
	hostPlayerId: text("host_player_id").notNull(),
	matchConfigJson: jsonb("match_config").$type<MatchConfig>().notNull(),
	matchId: uuid("match_id"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const lobbyPlayers = pgTable("lobby_players", {
	id: uuid("id").primaryKey().defaultRandom(),
	lobbyId: uuid("lobby_id")
		.notNull()
		.references(() => lobbies.id, { onDelete: "cascade" }),
	playerId: text("player_id").notNull(),
	username: text("username").notNull(),
	isHost: boolean("is_host").notNull().default(false),
	isReady: boolean("is_ready").notNull().default(false),
	joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

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

export const matchPlayers = pgTable("match_players", {
	id: uuid("id").primaryKey().defaultRandom(),
	matchId: uuid("match_id")
		.notNull()
		.references(() => matches.id, { onDelete: "cascade" }),
	playerId: text("player_id").notNull(),
	username: text("username").notNull(),
	joinedAt: timestamp("joined_at").notNull().defaultNow(),
	disconnectedAt: timestamp("disconnected_at"),
	clipCount: integer("clip_count").notNull().default(0),
});

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
}));

export const matchesRelations = relations(matches, ({ many, one }) => ({
	players: many(matchPlayers),
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
}));

export const clipEditOperationsRelations = relations(clipEditOperations, ({ one }) => ({
	match: one(matches, {
		fields: [clipEditOperations.matchId],
		references: [matches.id],
	}),
}));

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
