import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matches, videoLikes, matchPlayers, lobbies } from "@/lib/db/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { calculateContentDuration } from "@/lib/ffmpeg";
import { TimelineState } from "@/app/types/timeline";

export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const sortBy = searchParams.get("sort") || "date";
	const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
	const offset = parseInt(searchParams.get("offset") || "0");

	const session = await auth.api.getSession({ headers: await headers() });
	const userId = session?.user?.id;

	const likesSubquery = db()
		.select({
			matchId: videoLikes.matchId,
			likeCount: sql<number>`count(*)::int`.as("like_count"),
		})
		.from(videoLikes)
		.groupBy(videoLikes.matchId)
		.as("likes_count");

	const userLikeSubquery = userId
		? db()
				.select({
					matchId: videoLikes.matchId,
					liked: sql<boolean>`true`.as("liked"),
				})
				.from(videoLikes)
				.where(eq(videoLikes.userId, userId))
				.as("user_like")
		: null;

	let query = db()
		.select({
			id: matches.id,
			lobbyName: matches.lobbyName,
			renderUrl: matches.renderUrl,
			completedAt: matches.completedAt,
			editCount: matches.editCount,
			timelineJson: matches.timelineJson,
			likeCount: sql<number>`COALESCE(${likesSubquery.likeCount}, 0)`,
			liked: userLikeSubquery ? sql<boolean>`COALESCE(${userLikeSubquery.liked}, false)` : sql<boolean>`false`,
			joinCode: lobbies.joinCode,
		})
		.from(matches)
		.innerJoin(lobbies, eq(matches.lobbyId, lobbies.id))
		.leftJoin(likesSubquery, eq(matches.id, likesSubquery.matchId))
		.where(and(eq(matches.status, "completed"), sql`${matches.renderUrl} IS NOT NULL`))
		.limit(limit)
		.offset(offset);

	if (userLikeSubquery) {
		query = query.leftJoin(userLikeSubquery, eq(matches.id, userLikeSubquery.matchId)) as typeof query;
	}

	const results =
		sortBy === "likes"
			? await query.orderBy(desc(sql`COALESCE(${likesSubquery.likeCount}, 0)`), desc(matches.completedAt))
			: await query.orderBy(desc(matches.completedAt));

	const matchIds = results.map((r: { id: string }) => r.id);
	const playerCounts =
		matchIds.length > 0
			? await db()
					.select({
						matchId: matchPlayers.matchId,
						playerCount: sql<number>`count(*)::int`,
					})
					.from(matchPlayers)
					.where(inArray(matchPlayers.matchId, matchIds))
					.groupBy(matchPlayers.matchId)
			: [];

	const playerCountMap = new Map(playerCounts.map((p: { matchId: string; playerCount: number }) => [p.matchId, p.playerCount]));

	const videos = results.map(
		(r: {
			id: string;
			lobbyName: string;
			renderUrl: string | null;
			completedAt: Date | null;
			editCount: number;
			timelineJson: TimelineState;
			likeCount: number;
			liked: boolean;
			joinCode: string;
		}) => {
			const contentDuration = r.timelineJson?.tracks?.length ? calculateContentDuration(r.timelineJson) : 0;
			return {
				id: r.id,
				joinCode: r.joinCode,
				lobbyName: r.lobbyName,
				renderUrl: r.renderUrl,
				completedAt: r.completedAt,
				editCount: r.editCount,
				timelineDuration: Math.round(contentDuration * 10) / 10, // round to 1 decimal place
				likeCount: r.likeCount,
				liked: r.liked,
				playerCount: playerCountMap.get(r.id) || 0,
			};
		}
	);

	return NextResponse.json({ videos });
}
