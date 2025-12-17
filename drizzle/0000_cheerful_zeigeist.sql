CREATE TABLE "clip_edit_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"player_id" text NOT NULL,
	"operation_type" text NOT NULL,
	"clip_id" text NOT NULL,
	"track_id" text NOT NULL,
	"clip_data" jsonb,
	"previous_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lobbies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"join_code" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"host_player_id" text NOT NULL,
	"match_config" jsonb NOT NULL,
	"match_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lobbies_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "lobby_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lobby_id" uuid NOT NULL,
	"player_id" text NOT NULL,
	"username" text NOT NULL,
	"is_host" boolean DEFAULT false NOT NULL,
	"is_ready" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"player_id" text NOT NULL,
	"username" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"disconnected_at" timestamp,
	"clip_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lobby_id" uuid NOT NULL,
	"status" text DEFAULT 'preparing' NOT NULL,
	"config" jsonb NOT NULL,
	"timeline" jsonb NOT NULL,
	"started_at" timestamp,
	"ends_at" timestamp,
	"completed_at" timestamp,
	"render_job_id" text,
	"render_url" text,
	"render_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clip_edit_operations" ADD CONSTRAINT "clip_edit_operations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobby_players" ADD CONSTRAINT "lobby_players_lobby_id_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_lobby_id_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE no action ON UPDATE no action;