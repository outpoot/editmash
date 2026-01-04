import { NextRequest, NextResponse } from "next/server";
import { getMatchById, getMatchByIdInternal, updateMatchTimeline } from "@/lib/storage";
import { MatchStateResponse } from "@/app/types/match";
import type { TimelineState } from "@/app/types/timeline";
import { secureCompare } from "@/lib/security";

const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
	params: Promise<{
		matchId: string;
	}>;
}

export async function GET(
	request: NextRequest,
	{ params }: RouteParams
): Promise<NextResponse<MatchStateResponse | { error: string } | { redirect: string }>> {
	try {
		const { matchId } = await params;

		if (!matchId) {
			return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
		}

		const url = new URL(request.url);
		const isResultsRequest = url.searchParams.get("results") === "true" || request.headers.get("referer")?.includes("/results/");

		const isUUID = regex.test(matchId);
		const match = isUUID ? await getMatchByIdInternal(matchId) : await getMatchById(matchId);

		if (!match) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		if (!isResultsRequest && (match.status === "completed" || match.status === "rendering" || match.status === "failed")) {
			return NextResponse.json({ redirect: `/results/${matchId}` });
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
	try {
		const { matchId } = await params;

		const authHeader = request.headers.get("Authorization");
		const wsApiKey = process.env.WS_API_KEY;
		const providedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

		if (!secureCompare(providedKey, wsApiKey)) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const isUUID = regex.test(matchId);
		const match = isUUID ? await getMatchByIdInternal(matchId) : await getMatchById(matchId);

		if (!match) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		if (match.status !== "active" && match.status !== "preparing") {
			return NextResponse.json({ error: "Match is not active" }, { status: 400 });
		}

		const body = await request.json();
		const { timeline } = body as { timeline?: TimelineState };

		if (timeline) {
			await updateMatchTimeline(match.id, timeline);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error updating match:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
