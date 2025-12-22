import { NextRequest, NextResponse } from "next/server";
import { getMatchById, updateMatchTimeline } from "@/lib/storage";
import { MatchStateResponse } from "@/app/types/match";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { TimelineState } from "@/app/types/timeline";
import { timingSafeEqual, createHash } from "crypto";

function secureCompare(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;

	const hashA = createHash("sha256").update(a).digest();
	const hashB = createHash("sha256").update(b).digest();

	return timingSafeEqual(hashA, hashB);
}

interface RouteParams {
	params: Promise<{
		matchId: string;
	}>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse<MatchStateResponse | { error: string } | { redirect: string }>> {
	try {
		const { matchId } = await params;

		if (!matchId) {
			return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
		}

		const match = await getMatchById(matchId);

		if (!match) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		const url = new URL(request.url);
		const isResultsRequest = url.searchParams.get("results") === "true" || request.headers.get("referer")?.includes("/results/");

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
		const isWsAuth = secureCompare(providedKey, wsApiKey);

		if (!isWsAuth) {
			const session = await auth.api.getSession({ headers: await headers() });
			if (!session?.user) {
				return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
			}
		}

		const match = await getMatchById(matchId);
		if (!match) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		if (match.status !== "active" && match.status !== "preparing") {
			return NextResponse.json({ error: "Match is not active" }, { status: 400 });
		}

		const body = await request.json();
		const { timeline } = body as { timeline?: TimelineState };

		if (timeline) {
			await updateMatchTimeline(matchId, timeline);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error updating match:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
