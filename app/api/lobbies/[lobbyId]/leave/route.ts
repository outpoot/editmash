import { NextRequest, NextResponse } from "next/server";
import { removePlayerFromLobby, getLobbyById, getLobbyByJoinCode } from "@/lib/storage";
import { LeaveLobbyResponse } from "@/app/types/lobby";
import { getServerSession } from "@/lib/auth";
import { notifyWsServer } from "@/lib/wsNotify";
import { timingSafeEqual, createHash } from "crypto";

function secureCompare(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;

	const hashA = createHash("sha256").update(a).digest();
	const hashB = createHash("sha256").update(b).digest();

	return timingSafeEqual(hashA, hashB);
}

interface RouteParams {
	params: Promise<{
		lobbyId: string;
	}>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse<LeaveLobbyResponse | { error: string }>> {
	try {
		const { lobbyId } = await params;

		if (!lobbyId) {
			return NextResponse.json({ error: "Lobby ID is required" }, { status: 400 });
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

		let lobby = await getLobbyById(lobbyId);
		if (!lobby) {
			lobby = await getLobbyByJoinCode(lobbyId);
		}

		if (!lobby) {
			return NextResponse.json({ success: false, message: "Lobby not found" }, { status: 404 });
		}

		const result = await removePlayerFromLobby(lobby.id, userId);

		if (!result.success) {
			return NextResponse.json(result, { status: 400 });
		}

		notifyWsServer("/notify/lobbies", { lobbyId: lobby.id, userId, action: "player_left" });

		return NextResponse.json({
			success: true,
			message: result.message,
		});
	} catch (error) {
		console.error("Error leaving lobby:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
