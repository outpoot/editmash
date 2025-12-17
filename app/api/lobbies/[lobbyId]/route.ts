import { NextRequest, NextResponse } from "next/server";
import { getLobbyById, getLobbyByJoinCode } from "@/lib/storage";
import { Lobby } from "@/app/types/lobby";

interface RouteParams {
	params: Promise<{
		lobbyId: string;
	}>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse<Lobby | { error: string }>> {
	try {
		const { lobbyId } = await params;

		if (!lobbyId) {
			return NextResponse.json({ error: "Lobby ID is required" }, { status: 400 });
		}

		let lobby = await getLobbyById(lobbyId);

		if (!lobby) {
			lobby = await getLobbyByJoinCode(lobbyId);
		}

		if (!lobby) {
			return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
		}

		return NextResponse.json(lobby);
	} catch (error) {
		console.error("Error getting lobby:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
