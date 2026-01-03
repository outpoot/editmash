import { NextRequest, NextResponse } from "next/server";
import { addPlayerToMatch, getMatchById } from "@/lib/storage";
import { secureCompare } from "@/lib/security";

interface RouteParams {
	params: Promise<{
		matchId: string;
	}>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
	try {
		const { matchId } = await params;

		const authHeader = request.headers.get("Authorization");
		const wsApiKey = process.env.WS_API_KEY;
		const providedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

		if (!secureCompare(providedKey, wsApiKey)) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { userId } = body as { userId: string };

		if (!userId) {
			return NextResponse.json({ error: "User ID is required" }, { status: 400 });
		}

		const match = await getMatchById(matchId);
		if (!match) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		if (match.status !== "active" && match.status !== "preparing") {
			return NextResponse.json({ error: "Match is not active" }, { status: 400 });
		}

		const isNewPlayer = await addPlayerToMatch(match.id, userId);

		return NextResponse.json({ success: true, isNewPlayer });
	} catch (error) {
		console.error("Error adding player to match:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
