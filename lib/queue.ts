import { RenderJob } from "../app/types/render";
import { renderTimeline, downloadMediaFiles, cleanupTempFiles } from "./ffmpeg";
import { uploadToB2, deleteMultipleFromB2 } from "./b2";
import { getRedis, closeRedisConnection } from "./redis";
import fs from "fs/promises";
import path from "path";
import os from "os";

const JOBS_KEY = "render:jobs";
const QUEUE_KEY = "render:queue";
const ACTIVE_SLOTS_KEY = "render:active_slots";
const RENDER_PROGRESS_PREFIX = "render:progress:";
const SLOT_TTL = 60;
const HEARTBEAT_INTERVAL = 15000;
const PROGRESS_TTL = 300;

const MAX_SLOTS = Math.max(Math.floor(os.cpus().length / 2) - 4, 1);

const global = globalThis as unknown as {
	heartbeatInterval: NodeJS.Timeout | undefined;
	currentSlotToken: string | null;
};

async function getJob(jobId: string): Promise<RenderJob | null> {
	const jobData = await getRedis().hget(JOBS_KEY, jobId);
	if (!jobData) return null;
	return JSON.parse(jobData) as RenderJob;
}

async function setJob(job: RenderJob): Promise<void> {
	await getRedis().hset(JOBS_KEY, job.id, JSON.stringify(job));
}

async function deleteJobFromRedis(jobId: string): Promise<void> {
	await getRedis().hdel(JOBS_KEY, jobId);
}

async function getAllJobsFromRedis(): Promise<RenderJob[]> {
	const allJobs = await getRedis().hgetall(JOBS_KEY);
	return Object.values(allJobs).map((jobData) => JSON.parse(jobData) as RenderJob);
}

async function getActiveSlotCount(): Promise<number> {
	const now = Date.now();
	await getRedis().zremrangebyscore(ACTIVE_SLOTS_KEY, 0, now - SLOT_TTL * 1000);
	return await getRedis().zcard(ACTIVE_SLOTS_KEY);
}

async function tryAcquireSlot(): Promise<string | null> {
	const token = `${process.pid}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
	const now = Date.now();

	await getRedis().zremrangebyscore(ACTIVE_SLOTS_KEY, 0, now - SLOT_TTL * 1000);

	const luaScript = `
		local activeCount = redis.call("ZCARD", KEYS[1])
		local maxSlots = tonumber(ARGV[1])
		if activeCount >= maxSlots then
			return 0
		end
		redis.call("ZADD", KEYS[1], ARGV[2], ARGV[3])
		return 1
	`;

	const result = await getRedis().eval(luaScript, 1, ACTIVE_SLOTS_KEY, MAX_SLOTS, now, token);

	if (result === 1) {
		global.currentSlotToken = token;
		console.log(`Slot acquired with token: ${token} (${await getActiveSlotCount()}/${MAX_SLOTS} active)`);
		return token;
	}

	return null;
}

async function releaseSlot(token: string): Promise<boolean> {
	if (!token) return false;

	const result = await getRedis().zrem(ACTIVE_SLOTS_KEY, token);

	if (result === 1) {
		console.log(`Slot released for token: ${token}`);
		if (global.currentSlotToken === token) {
			global.currentSlotToken = null;
		}
		return true;
	}

	console.warn(`Failed to release slot - token not found`);
	return false;
}

async function renewSlot(token: string): Promise<void> {
	if (!token) return;

	const now = Date.now();
	const result = await getRedis().zadd(ACTIVE_SLOTS_KEY, "XX", "CH", now, token);

	if (result === 1) {
		console.log(`Slot renewed for token: ${token}`);
	} else {
		console.warn(`Failed to renew slot - token not found`);
	}
}

function startHeartbeat(token: string): void {
	stopHeartbeat();

	global.heartbeatInterval = setInterval(() => {
		renewSlot(token).catch((err) => {
			console.error("Error renewing slot:", err);
		});
	}, HEARTBEAT_INTERVAL);

	console.log(`Heartbeat started for token: ${token}`);
}

function stopHeartbeat(): void {
	if (global.heartbeatInterval) {
		clearInterval(global.heartbeatInterval);
		global.heartbeatInterval = undefined;
		console.log(`Heartbeat stopped`);
	}
}

async function addToQueue(jobId: string): Promise<void> {
	await getRedis().rpush(QUEUE_KEY, jobId);
}

async function removeFromQueue(jobId: string): Promise<void> {
	await getRedis().lrem(QUEUE_KEY, 0, jobId);
}

async function popFromQueue(): Promise<string | null> {
	return await getRedis().lpop(QUEUE_KEY);
}

async function getQueueLength(): Promise<number> {
	return await getRedis().llen(QUEUE_KEY);
}

export async function getQueuePosition(jobId: string): Promise<number | null> {
	const job = await getJob(jobId);
	if (!job || job.status !== "pending") return null;

	const queue = await getRedis().lrange(QUEUE_KEY, 0, -1);
	const queueIndex = queue.indexOf(jobId);
	if (queueIndex === -1) return null;

	return queueIndex + 1;
}

export async function getRenderProgress(matchId: string): Promise<number | null> {
	const progress = await getRedis().get(`${RENDER_PROGRESS_PREFIX}${matchId}`);
	return progress ? parseFloat(progress) : null;
}

export async function setRenderProgress(matchId: string, progress: number): Promise<void> {
	await getRedis().set(`${RENDER_PROGRESS_PREFIX}${matchId}`, progress.toString(), "EX", PROGRESS_TTL);
}

export async function createRenderJob(job: Omit<RenderJob, "id" | "status" | "progress" | "createdAt">): Promise<RenderJob> {
	const renderJob: RenderJob = {
		...job,
		id: `job_${Date.now()}_${Math.random().toString(36).substring(7)}`,
		status: "pending",
		progress: 0,
		createdAt: Date.now(),
	};

	await setJob(renderJob);
	await addToQueue(renderJob.id);

	const totalJobs = await getRedis().hlen(JOBS_KEY);
	console.log(`Job created: ${renderJob.id}, total jobs: ${totalJobs}`);

	processNextJob().catch((err) => {
		console.error("Error triggering job processing:", err);
	});

	return renderJob;
}

export async function getJobById(jobId: string): Promise<RenderJob | null> {
	return await getJob(jobId);
}

export async function getAllJobs(): Promise<RenderJob[]> {
	return await getAllJobsFromRedis();
}

async function updateJob(jobId: string, updates: Partial<RenderJob>): Promise<void> {
	const job = await getJob(jobId);
	if (job) {
		const updatedJob = { ...job, ...updates };
		await setJob(updatedJob);
	}
}

async function processNextJob(): Promise<void> {
	const queueLength = await getQueueLength();
	if (queueLength === 0) {
		return;
	}

	let slotToken: string | null = null;
	let jobId: string | null = null;
	let job: RenderJob | null = null;

	try {
		slotToken = await tryAcquireSlot();
		if (!slotToken) {
			console.log(`No slots available, retrying in 1 second...`);
			setTimeout(() => processNextJob(), 1000);
			return;
		}

		jobId = await popFromQueue();

		if (!jobId) {
			console.log(`No job found in queue`);
			await releaseSlot(slotToken);
			return;
		}

		job = await getJob(jobId);
		if (!job) {
			console.warn(`Job ${jobId} not found in storage`);
			await releaseSlot(slotToken);
			return;
		}

		startHeartbeat(slotToken);

		await updateJob(jobId, { status: "processing", startedAt: Date.now() });

		const mediaUrls: Record<string, string> = {};

		const allClips = job.timelineState.tracks.flatMap((track) => track.clips);
		console.log(`[Queue] Job ${jobId}: Processing ${allClips.length} clips from ${job.timelineState.tracks.length} tracks`);
		
		allClips.forEach((clip) => {
			if (!mediaUrls[clip.src]) {
				mediaUrls[clip.src] = clip.src;
			}
		});

		console.log(`[Queue] Job ${jobId}: Downloading ${Object.keys(mediaUrls).length} unique media files`);
		const mediaFiles = await downloadMediaFiles(mediaUrls);
		await updateJob(jobId, { progress: 10 });

		const outputDir = path.join(os.tmpdir(), "editmash", "renders");
		await fs.mkdir(outputDir, { recursive: true });
		const outputFileName = `render_${jobId}.mp4`;
		const outputPath = path.join(outputDir, outputFileName);

		console.log(`[Queue] Job ${jobId}: Starting render to ${outputPath}`);
		await renderTimeline(job.timelineState, mediaFiles, outputPath, (progress) => {
			const adjustedProgress = 10 + (progress / 100) * 70;
			updateJob(jobId || "", { progress: adjustedProgress }).catch((err) => {
				console.error(`Error updating render progress for job ${jobId}:`, err);
			});
		});

		console.log(`[Queue] Job ${jobId}: Render complete, uploading to B2`);
		await updateJob(jobId, { progress: 80 });

		const outputBuffer = await fs.readFile(outputPath);
		const b2FileName = `renders/${outputFileName}`;
		const uploadedFile = await uploadToB2(outputBuffer, b2FileName, "video/mp4", (uploadProgress) => {
			const adjustedProgress = 80 + (uploadProgress / 100) * 20;
			updateJob(jobId || "", { progress: adjustedProgress }).catch((err) => {
				console.error(`Error updating upload progress for job ${jobId}:`, err);
			});
		});

		await cleanupTempFiles(mediaFiles);
		await fs.unlink(outputPath);

		const proxiedUrl = `/api/media/${encodeURIComponent(uploadedFile.fileName)}`;

		await updateJob(jobId, {
			status: "completed",
			progress: 100,
			completedAt: Date.now(),
			outputUrl: proxiedUrl,
			outputFileId: uploadedFile.fileId,
		});

	} catch (error) {
		if (jobId) {
			await updateJob(jobId, {
				status: "failed",
				error: error instanceof Error ? error.message : String(error),
				completedAt: Date.now(),
			});
		}
		console.error(`Error processing job:`, error);
	} finally {
		if (job && job.sourceFileIds && job.sourceFileIds.length > 0) {
			try {
				const deleteResults = await deleteMultipleFromB2(job.sourceFileIds);
				const failures = deleteResults.filter((r) => !r.success);
				if (failures.length > 0) {
					console.error(
						`Failed to delete ${failures.length}/${deleteResults.length} source files:`,
						failures.map((f) => `${f.fileName}: ${f.error}`).join(", ")
					);
				} else {
					console.log(`Successfully deleted ${deleteResults.length} source files`);
				}
			} catch (cleanupError) {
				console.error(`Error during source file cleanup:`, cleanupError);
			}
		}

		if (slotToken) {
			stopHeartbeat();
			await releaseSlot(slotToken);

			const remainingJobs = await getQueueLength();
			if (remainingJobs > 0) {
				setTimeout(() => processNextJob(), 100);
			}
		}
	}
}


export async function cancelJob(jobId: string): Promise<boolean> {
	const job = await getJob(jobId);
	if (!job) return false;

	if (job.status === "pending") {
		await removeFromQueue(jobId);
		await updateJob(jobId, { status: "failed", error: "Cancelled by user" });
		return true;
	}

	return false;
}

export async function deleteJob(jobId: string): Promise<boolean> {
	const job = await getJob(jobId);
	if (!job) return false;

	if (job.status === "processing") {
		return false;
	}

	await deleteJobFromRedis(jobId);
	await removeFromQueue(jobId);

	return true;
}

export async function gracefulShutdown(): Promise<void> {
	stopHeartbeat();

	if (global.currentSlotToken) {
		try {
			await releaseSlot(global.currentSlotToken);
		} catch (error) {
			console.error("Error releasing slot on shutdown:", error);
		}
	}

	await closeRedisConnection();

	console.log("Graceful shutdown completed");
}
