import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { videoLikes } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function POST(request: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
	const { matchId } = await params;

	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const userId = session.user.id;

	const result = await db().transaction(async (tx) => {
		const existing = await tx
			.select()
			.from(videoLikes)
			.where(and(eq(videoLikes.matchId, matchId), eq(videoLikes.userId, userId)))
			.limit(1);

		if (existing.length > 0) {
			await tx.delete(videoLikes).where(and(eq(videoLikes.matchId, matchId), eq(videoLikes.userId, userId)));

			const countResult = await tx
				.select({ count: sql<number>`count(*)::int` })
				.from(videoLikes)
				.where(eq(videoLikes.matchId, matchId));

			return { liked: false, likeCount: countResult[0]?.count || 0 };
		} else {
			await tx.insert(videoLikes).values({
				matchId,
				userId,
			});

			const countResult = await tx
				.select({ count: sql<number>`count(*)::int` })
				.from(videoLikes)
				.where(eq(videoLikes.matchId, matchId));

			return { liked: true, likeCount: countResult[0]?.count || 0 };
		}
	});

	return NextResponse.json(result);
}
