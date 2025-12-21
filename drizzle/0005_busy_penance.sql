CREATE TABLE "match_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"uploaded_by" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"file_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "match_media_type_check" CHECK ("match_media"."type" IN ('video', 'audio', 'image'))
);
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "lobbies" ADD COLUMN "is_system_lobby" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_media" ADD CONSTRAINT "match_media_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_media" ADD CONSTRAINT "match_media_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_media_matchId_idx" ON "match_media" USING btree ("match_id");