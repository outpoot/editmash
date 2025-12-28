import { NextRequest, NextResponse } from "next/server";
import { createLobby, listLobbies, ensureSystemLobbiesExist, cleanupStaleMatches } from "@/lib/storage";
import { validateMatchConfig } from "@/lib/clipConstraints";
import { DEFAULT_MATCH_CONFIG, MatchConfig } from "@/app/types/match";
import { CreateLobbyRequest, CreateLobbyResponse, LobbyListResponse, LobbyStatus } from "@/app/types/lobby";
import { getServerSession } from "@/lib/auth";
import { notifyWsServer } from "@/lib/wsNotify";

export async function POST(request: NextRequest): Promise<NextResponse<CreateLobbyResponse | { error: string }>> {
	try {
		const session = await getServerSession();
		if (!session) {
			return NextResponse.json({ error: "Authentication required" }, { status: 401 });
		}

		const body = (await request.json()) as CreateLobbyRequest;

		if (!body.name || typeof body.name !== "string") {
			return NextResponse.json({ error: "Lobby name is required" }, { status: 400 });
		}

		const userId = session.user.id;

		const matchConfig: MatchConfig = {
			...DEFAULT_MATCH_CONFIG,
			...body.matchConfig,
			constraints: body.matchConfig?.constraints || [],
		};

		const configValidation = validateMatchConfig(matchConfig);
		if (!configValidation.valid) {
			return NextResponse.json({ error: configValidation.reason || "Invalid match configuration" }, { status: 400 });
		}

		const result = await createLobby(body.name, matchConfig, userId);

		notifyWsServer("/notify/lobbies", { lobbyId: result.lobbyId, userId, action: "lobby_created" });

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

		if (!status || status === "waiting") {
			await cleanupStaleMatches();
			await ensureSystemLobbiesExist();
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
