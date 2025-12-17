import { NextRequest, NextResponse } from "next/server";
import { startMatchFromLobby } from "@/lib/matchManager";
import { StartMatchRequest, StartMatchResponse } from "@/app/types/match";

export async function POST(request: NextRequest): Promise<NextResponse<StartMatchResponse | { error: string }>> {
	try {
		const body = (await request.json()) as StartMatchRequest;

		if (!body.lobbyId || typeof body.lobbyId !== "string") {
			return NextResponse.json({ error: "Lobby ID is required" }, { status: 400 });
		}

		const result = await startMatchFromLobby(body.lobbyId);

		if (!result.success) {
			return NextResponse.json(result, { status: 400 });
		}

		return NextResponse.json(result);
	} catch (error) {
		console.error("Error starting match:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
