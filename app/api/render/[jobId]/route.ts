import { NextRequest, NextResponse } from "next/server";
import { getJobById, getQueuePosition } from "@/lib/queue";
import { RenderJobStatusResponse } from "@/app/types/render";

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
	try {
		const { jobId } = await params;

		const job = await getJobById(jobId);

		if (!job) {
			return NextResponse.json({ error: "Job not found" }, { status: 404 });
		}

		const queuePosition = await getQueuePosition(jobId);

		const response: RenderJobStatusResponse = { job, queuePosition };

		return NextResponse.json(response);
	} catch (error) {
		return NextResponse.json(
			{ error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
}
