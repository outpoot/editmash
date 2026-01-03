import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matchMedia, matches, user, lobbies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

interface RouteParams {
	params: Promise<{
		matchId: string;
	}>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
	try {
		const { matchId } = await params;

		const [lobbyRecord] = await db()
			.select({ matchId: lobbies.matchId })
			.from(lobbies)
			.where(eq(lobbies.joinCode, matchId.toUpperCase()))
			.limit(1);

		if (!lobbyRecord?.matchId) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		const media = await db()
			.select({
				id: matchMedia.id,
				matchId: matchMedia.matchId,
				uploadedBy: matchMedia.uploadedBy,
				uploaderName: user.name,
				name: matchMedia.name,
				type: matchMedia.type,
				url: matchMedia.url,
				fileId: matchMedia.fileId,
				createdAt: matchMedia.createdAt,
			})
			.from(matchMedia)
			.leftJoin(user, eq(matchMedia.uploadedBy, user.id))
			.where(eq(matchMedia.matchId, lobbyRecord.matchId));

		return NextResponse.json({ media });
	} catch (error) {
		console.error("Error getting match media:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

export async function POST(request: NextRequest, { params }: RouteParams) {
	try {
		const { matchId } = await params;

		const session = await auth.api.getSession({ headers: await headers() });
		if (!session?.user) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { name, type, url, fileId } = body;

		if (!name || !type || !url) {
			return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
		}

		const [lobbyRecord] = await db()
			.select({ matchId: lobbies.matchId })
			.from(lobbies)
			.where(eq(lobbies.joinCode, matchId.toUpperCase()))
			.limit(1);

		if (!lobbyRecord?.matchId) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		const actualMatchId = lobbyRecord.matchId;

		const match = await db().select().from(matches).where(eq(matches.id, actualMatchId)).limit(1);
		if (!match.length) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		const existing = await db()
			.select()
			.from(matchMedia)
			.where(and(eq(matchMedia.url, url), eq(matchMedia.matchId, actualMatchId)))
			.limit(1);
		if (existing.length) {
			return NextResponse.json({ success: true, id: existing[0].id, message: "Media already exists" });
		}

		const [inserted] = await db()
			.insert(matchMedia)
			.values({
				matchId: actualMatchId,
				uploadedBy: session.user.id,
				name,
				type,
				url,
				fileId,
			})
			.returning({ id: matchMedia.id });

		return NextResponse.json({ success: true, id: inserted.id });
	} catch (error) {
		console.error("Error adding match media:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
	try {
		const { matchId } = await params;

		const session = await auth.api.getSession({ headers: await headers() });
		if (!session?.user) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const mediaId = searchParams.get("mediaId");

		if (!mediaId) {
			return NextResponse.json({ error: "Media ID is required" }, { status: 400 });
		}

		const [lobbyRecord] = await db()
			.select({ matchId: lobbies.matchId })
			.from(lobbies)
			.where(eq(lobbies.joinCode, matchId.toUpperCase()))
			.limit(1);

		if (!lobbyRecord?.matchId) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		const result = await db()
			.delete(matchMedia)
			.where(and(eq(matchMedia.id, mediaId), eq(matchMedia.matchId, lobbyRecord.matchId)))
			.returning({ id: matchMedia.id });

		if (result.length === 0) {
			return NextResponse.json({ error: "Media not found for this match" }, { status: 404 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error deleting match media:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
