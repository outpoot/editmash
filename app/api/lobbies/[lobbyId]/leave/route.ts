import { NextRequest, NextResponse } from "next/server";
import { removePlayerFromLobby, getLobbyById, getLobbyByJoinCode } from "@/lib/storage";
import { LeaveLobbyResponse } from "@/app/types/lobby";
import { getServerSession } from "@/lib/auth";
import { notifyWsServer } from "@/lib/wsNotify";

interface RouteParams {
	params: Promise<{
		lobbyId: string;
	}>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse<LeaveLobbyResponse | { error: string }>> {
	try {
		const session = await getServerSession();
		if (!session) {
			return NextResponse.json({ error: "Authentication required" }, { status: 401 });
		}

		const { lobbyId } = await params;

		if (!lobbyId) {
			return NextResponse.json({ error: "Lobby ID is required" }, { status: 400 });
		}

		const userId = session.user.id;

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
