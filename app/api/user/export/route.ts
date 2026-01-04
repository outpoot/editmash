import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
	user,
	session,
	account,
	lobbyPlayers,
	matchPlayers,
	matchMedia,
	videoLikes,
	lobbies,
	matches,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
	try {
		const currentSession = await getServerSession();
		if (!currentSession) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const db = getDb();
		const userId = currentSession.user.id;

		const [userData] = await db.select().from(user).where(eq(user.id, userId)).limit(1);

		if (!userData) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		const sessionsData = await db
			.select({
				id: session.id,
				createdAt: session.createdAt,
				expiresAt: session.expiresAt,
				ipAddress: session.ipAddress,
				userAgent: session.userAgent,
			})
			.from(session)
			.where(eq(session.userId, userId));

		const accountsData = await db
			.select({
				id: account.id,
				providerId: account.providerId,
				accountId: account.accountId,
				createdAt: account.createdAt,
			})
			.from(account)
			.where(eq(account.userId, userId));

		const lobbyParticipation = await db
			.select({
				lobbyId: lobbyPlayers.lobbyId,
				isHost: lobbyPlayers.isHost,
				joinedAt: lobbyPlayers.joinedAt,
				lobbyName: lobbies.name,
				lobbyStatus: lobbies.status,
			})
			.from(lobbyPlayers)
			.leftJoin(lobbies, eq(lobbyPlayers.lobbyId, lobbies.id))
			.where(eq(lobbyPlayers.userId, userId));

		const matchParticipation = await db
			.select({
				matchId: matchPlayers.matchId,
				joinedAt: matchPlayers.joinedAt,
				disconnectedAt: matchPlayers.disconnectedAt,
				clipCount: matchPlayers.clipCount,
				matchStatus: matches.status,
				lobbyName: matches.lobbyName,
				startedAt: matches.startedAt,
				completedAt: matches.completedAt,
			})
			.from(matchPlayers)
			.leftJoin(matches, eq(matchPlayers.matchId, matches.id))
			.where(eq(matchPlayers.userId, userId));

		const uploadedMedia = await db
			.select({
				id: matchMedia.id,
				matchId: matchMedia.matchId,
				name: matchMedia.name,
				type: matchMedia.type,
				createdAt: matchMedia.createdAt,
			})
			.from(matchMedia)
			.where(eq(matchMedia.uploadedBy, userId));

		const likes = await db
			.select({
				matchId: videoLikes.matchId,
				createdAt: videoLikes.createdAt,
			})
			.from(videoLikes)
			.where(eq(videoLikes.userId, userId));

		const exportData = {
			exportedAt: new Date().toISOString(),
			exportVersion: "1.0",
			user: {
				id: userData.id,
				name: userData.name,
				email: userData.email,
				emailVerified: userData.emailVerified,
				image: userData.image,
				highlightColor: userData.highlightColor,
				tutorialCompleted: userData.tutorialCompleted,
				createdAt: userData.createdAt,
				updatedAt: userData.updatedAt,
			},
			connectedAccounts: accountsData.map((acc) => ({
				provider: acc.providerId,
				accountId: acc.accountId,
				connectedAt: acc.createdAt,
			})),
			sessions: sessionsData.map((s) => ({
				id: s.id,
				createdAt: s.createdAt,
				expiresAt: s.expiresAt,
				ipAddress: s.ipAddress,
				userAgent: s.userAgent,
			})),
			lobbyHistory: lobbyParticipation.map((lp) => ({
				lobbyId: lp.lobbyId,
				lobbyName: lp.lobbyName,
				status: lp.lobbyStatus,
				wasHost: lp.isHost,
				joinedAt: lp.joinedAt,
			})),
			matchHistory: matchParticipation.map((mp) => ({
				matchId: mp.matchId,
				lobbyName: mp.lobbyName,
				status: mp.matchStatus,
				joinedAt: mp.joinedAt,
				disconnectedAt: mp.disconnectedAt,
				clipCount: mp.clipCount,
				startedAt: mp.startedAt,
				completedAt: mp.completedAt,
			})),
			uploadedMedia: uploadedMedia.map((m) => ({
				id: m.id,
				matchId: m.matchId,
				name: m.name,
				type: m.type,
				uploadedAt: m.createdAt,
			})),
			videoLikes: likes.map((l) => ({
				matchId: l.matchId,
				likedAt: l.createdAt,
			})),
		};

		const jsonString = JSON.stringify(exportData, null, 2);
		const filename = `editmash-data-export-${userData.id}-${new Date().toISOString().split("T")[0]}.json`;

		return new NextResponse(jsonString, {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Content-Disposition": `attachment; filename="${filename}"`,
			},
		});
	} catch (error) {
		console.error("Error exporting user data:", error);
		return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
	}
}
