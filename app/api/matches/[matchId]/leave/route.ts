import { NextRequest, NextResponse } from "next/server";
import { markPlayerDisconnected, getMatchById, removePlayerFromLobby } from "@/lib/storage";
import { getServerSession } from "@/lib/auth";
import { notifyWsServer } from "@/lib/wsNotify";
import { secureCompare } from "@/lib/security";

interface RouteParams {
	params: Promise<{
		matchId: string;
	}>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
	try {
		const { matchId } = await params;

		if (!matchId) {
			return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
		}

		const authHeader = request.headers.get("Authorization");
		const wsApiKey = process.env.WS_API_KEY;
		const providedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

		let userId: string;

		if (secureCompare(providedKey, wsApiKey)) {
			const body = await request.json().catch(() => ({}));
			if (!body.userId) {
				return NextResponse.json({ error: "userId is required" }, { status: 400 });
			}
			userId = body.userId;
		} else {
			const session = await getServerSession();
			if (!session) {
				return NextResponse.json({ error: "Authentication required" }, { status: 401 });
			}
			userId = session.user.id;
		}

		const match = await getMatchById(matchId);
		if (!match) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		await markPlayerDisconnected(match.id, userId);

		// Also remove player from the associated lobby so they don't show in the lobby list
		if (match.lobbyId) {
			await removePlayerFromLobby(match.lobbyId, userId);
			notifyWsServer("/notify/lobbies", { lobbyId: match.lobbyId, userId, action: "player_left" });
		}

		return NextResponse.json({
			success: true,
			message: "Left match successfully",
		});
	} catch (error) {
		console.error("Error leaving match:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
