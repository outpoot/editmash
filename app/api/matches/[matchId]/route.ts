import { NextRequest, NextResponse } from "next/server";
import { getMatchById } from "@/lib/storage";
import { getMatchStatus } from "@/lib/matchManager";
import { MatchStateResponse, MatchStatusResponse } from "@/app/types/match";

interface RouteParams {
	params: Promise<{
		matchId: string;
	}>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse<MatchStateResponse | { error: string }>> {
	try {
		const { matchId } = await params;

		if (!matchId) {
			return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
		}

		const match = await getMatchById(matchId);

		if (!match) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		let timeRemaining: number | null = null;
		if (match.status === "active" && match.endsAt) {
			timeRemaining = Math.max(0, (match.endsAt.getTime() - Date.now()) / 1000);
		}

		return NextResponse.json({
			match,
			timeline: match.timeline,
			timeRemaining,
		});
	} catch (error) {
		console.error("Error getting match:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
