import { NextRequest, NextResponse } from "next/server";
import { removePlayerFromLobby, getLobbyById, getLobbyByJoinCode } from "@/lib/storage";
import { LeaveLobbyRequest, LeaveLobbyResponse } from "@/app/types/lobby";

interface RouteParams {
	params: Promise<{
		lobbyId: string;
	}>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse<LeaveLobbyResponse | { error: string }>> {
	try {
		const { lobbyId } = await params;
		const body = (await request.json()) as LeaveLobbyRequest;

		if (!lobbyId) {
			return NextResponse.json({ error: "Lobby ID is required" }, { status: 400 });
		}

		if (!body.playerId || typeof body.playerId !== "string") {
			return NextResponse.json({ error: "Player ID is required" }, { status: 400 });
		}

		let lobby = await getLobbyById(lobbyId);
		if (!lobby) {
			lobby = await getLobbyByJoinCode(lobbyId);
		}

		if (!lobby) {
			return NextResponse.json({ success: false, message: "Lobby not found" }, { status: 404 });
		}

		const result = await removePlayerFromLobby(lobby.id, body.playerId);

		if (!result.success) {
			return NextResponse.json(result, { status: 400 });
		}

		return NextResponse.json({
			success: true,
			message: result.message,
		});
	} catch (error) {
		console.error("Error leaving lobby:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
