import { NextRequest, NextResponse } from "next/server";
import { addPlayerToLobby, getLobbyById, getLobbyByJoinCode } from "@/lib/storage";
import { JoinLobbyResponse } from "@/app/types/lobby";
import { getServerSession } from "@/lib/auth";
import { notifyWsServer } from "@/lib/wsNotify";

interface RouteParams {
	params: Promise<{
		lobbyId: string;
	}>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse<JoinLobbyResponse | { error: string }>> {
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

		const result = await addPlayerToLobby(lobby.id, userId);

		if (!result.success) {
			return NextResponse.json(result, { status: 400 });
		}

		notifyWsServer("/notify/lobbies", { lobbyId: lobby.id, userId, action: "player_joined" });

		const updatedLobby = await getLobbyById(lobby.id);

		return NextResponse.json({
			success: true,
			message: result.message,
			lobby: updatedLobby || undefined,
		});
	} catch (error) {
		console.error("Error joining lobby:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
