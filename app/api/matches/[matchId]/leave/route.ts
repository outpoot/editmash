import { NextRequest, NextResponse } from "next/server";
import { markPlayerDisconnected, getMatchById } from "@/lib/storage";
import { getServerSession } from "@/lib/auth";

interface RouteParams {
	params: Promise<{
		matchId: string;
	}>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
	try {
		const session = await getServerSession();
		if (!session) {
			return NextResponse.json({ error: "Authentication required" }, { status: 401 });
		}

		const { matchId } = await params;

		if (!matchId) {
			return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
		}

		const userId = session.user.id;

		const match = await getMatchById(matchId);
		if (!match) {
			return NextResponse.json({ error: "Match not found" }, { status: 404 });
		}

		await markPlayerDisconnected(matchId, userId);

		return NextResponse.json({
			success: true,
			message: "Left match successfully",
		});
	} catch (error) {
		console.error("Error leaving match:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
