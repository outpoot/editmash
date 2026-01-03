ALTER TABLE "lobbies" ADD COLUMN "is_listed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "short_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_short_id_unique" UNIQUE("short_id");