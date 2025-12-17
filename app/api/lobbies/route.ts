import { NextRequest, NextResponse } from "next/server";
import { createLobby, listLobbies } from "@/lib/storage";
import { validateMatchConfig } from "@/lib/constraints";
import { DEFAULT_MATCH_CONFIG, MatchConfig } from "@/app/types/match";
import { CreateLobbyRequest, CreateLobbyResponse, LobbyListResponse, LobbyStatus } from "@/app/types/lobby";

export async function POST(request: NextRequest): Promise<NextResponse<CreateLobbyResponse | { error: string }>> {
	try {
		const body = (await request.json()) as CreateLobbyRequest;

		if (!body.name || typeof body.name !== "string") {
			return NextResponse.json({ error: "Lobby name is required" }, { status: 400 });
		}

		if (!body.hostPlayerId || typeof body.hostPlayerId !== "string") {
			return NextResponse.json({ error: "Host player ID is required" }, { status: 400 });
		}

		if (!body.hostUsername || typeof body.hostUsername !== "string") {
			return NextResponse.json({ error: "Host username is required" }, { status: 400 });
		}

		const matchConfig: MatchConfig = {
			...DEFAULT_MATCH_CONFIG,
			...body.matchConfig,
			constraints: body.matchConfig?.constraints || [],
		};

		const configValidation = validateMatchConfig(matchConfig);
		if (!configValidation.valid) {
			return NextResponse.json({ error: configValidation.reason || "Invalid match configuration" }, { status: 400 });
		}

		const result = await createLobby(body.name, matchConfig, body.hostPlayerId, body.hostUsername);

		return NextResponse.json({
			lobbyId: result.lobbyId,
			joinCode: result.joinCode,
		});
	} catch (error) {
		console.error("Error creating lobby:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

export async function GET(request: NextRequest): Promise<NextResponse<LobbyListResponse | { error: string }>> {
	try {
		const { searchParams } = new URL(request.url);
		const status = searchParams.get("status") as LobbyStatus | null;

		if (status && !["waiting", "starting", "in_match", "closed"].includes(status)) {
			return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
		}

		const lobbies = await listLobbies(status || undefined);

		return NextResponse.json({
			lobbies,
			total: lobbies.length,
		});
	} catch (error) {
		console.error("Error listing lobbies:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
