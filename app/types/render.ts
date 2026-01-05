import { TimelineState } from "./timeline";

export interface RenderJob {
	id: string;
	timelineState: TimelineState;
	status: "pending" | "processing" | "completed" | "failed";
	progress: number;
	createdAt: number;
	startedAt?: number;
	completedAt?: number;
	error?: string;
	outputUrl?: string;
	outputFileId?: string;
	sourceFileIds?: Array<{ fileName: string; fileId: string }>;
}

export interface RenderJobRequest {
	timelineState: TimelineState;
	mediaUrls?: Record<string, string>;
	sourceFileIds?: Array<{ fileName: string; fileId: string }>;
}

export interface RenderJobResponse {
	jobId: string;
	status: string;
}

export interface RenderJobStatusResponse {
	job: RenderJob;
	queuePosition: number | null;
}
