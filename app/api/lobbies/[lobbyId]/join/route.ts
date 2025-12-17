import { NextRequest, NextResponse } from "next/server";
import { addPlayerToLobby, getLobbyById, getLobbyByJoinCode } from "@/lib/storage";
import { JoinLobbyRequest, JoinLobbyResponse } from "@/app/types/lobby";

interface RouteParams {
	params: Promise<{
		lobbyId: string;
	}>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse<JoinLobbyResponse | { error: string }>> {
	try {
		const { lobbyId } = await params;
		const body = (await request.json()) as JoinLobbyRequest;

		if (!lobbyId) {
			return NextResponse.json({ error: "Lobby ID is required" }, { status: 400 });
		}

		if (!body.playerId || typeof body.playerId !== "string") {
			return NextResponse.json({ error: "Player ID is required" }, { status: 400 });
		}

		if (!body.username || typeof body.username !== "string") {
			return NextResponse.json({ error: "Username is required" }, { status: 400 });
		}

		let lobby = await getLobbyById(lobbyId);
		if (!lobby) {
			lobby = await getLobbyByJoinCode(lobbyId);
		}

		if (!lobby) {
			return NextResponse.json({ success: false, message: "Lobby not found" }, { status: 404 });
		}

		const result = await addPlayerToLobby(lobby.id, body.playerId, body.username);

		if (!result.success) {
			return NextResponse.json(result, { status: 400 });
		}

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
