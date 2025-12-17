import { NextRequest, NextResponse } from "next/server";
import { getMatchStatus } from "@/lib/matchManager";
import { MatchStatusResponse } from "@/app/types/match";

interface RouteParams {
	params: Promise<{
		matchId: string;
	}>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse<MatchStatusResponse | { error: string }>> {
	try {
		const { matchId } = await params;

		if (!matchId) {
			return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
		}

		const status = await getMatchStatus(matchId);

		if (!status) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		return NextResponse.json(status);
	} catch (error) {
		console.error("Error getting match status:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
