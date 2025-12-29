CREATE TABLE "video_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "video_likes_unique_idx" UNIQUE("match_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "tutorial_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "video_likes" ADD CONSTRAINT "video_likes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_likes" ADD CONSTRAINT "video_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_likes_matchId_idx" ON "video_likes" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "video_likes_userId_idx" ON "video_likes" USING btree ("user_id");