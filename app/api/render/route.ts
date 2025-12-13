import { NextRequest, NextResponse } from "next/server";
import { createRenderJob } from "@/lib/queue";
import { RenderJobRequest, RenderJobResponse } from "@/app/types/render";

export async function POST(request: NextRequest) {
	try {
		const body: RenderJobRequest = await request.json();

		if (!body.timelineState) {
			return NextResponse.json({ error: "Missing timelineState" }, { status: 400 });
		}

		const job = await createRenderJob({
			timelineState: body.timelineState,
			sourceFileIds: body.sourceFileIds,
		});

		const response: RenderJobResponse = {
			jobId: job.id,
			status: job.status,
		};

		return NextResponse.json(response);
	} catch (error) {
		return NextResponse.json(
			{ error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
}
