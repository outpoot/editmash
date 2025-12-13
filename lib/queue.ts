import { RenderJob } from "../app/types/render";
import { renderTimeline, downloadMediaFiles, cleanupTempFiles } from "./ffmpeg";
import { uploadToB2, deleteMultipleFromB2 } from "./b2";
import fs from "fs/promises";
import path from "path";
import os from "os";
import Redis from "ioredis";

const JOBS_KEY = "render:jobs";
const QUEUE_KEY = "render:queue";
const PROCESSING_KEY = "render:processing";
const PROCESSING_LOCK_TTL = 60;
const HEARTBEAT_INTERVAL = 15000;

const global = globalThis as unknown as {
	redisClient: Redis | undefined;
	redisConnectionLogged: boolean;
	heartbeatInterval: NodeJS.Timeout | undefined;
	currentLockToken: string | null;
};

function getRedis(): Redis {
	if (!global.redisClient) {
		const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

		global.redisClient = new Redis(redisUrl, {
			maxRetriesPerRequest: 3,
			retryStrategy: (times) => {
				if (times > 10) {
					return null;
				}
				return Math.min(times * 100, 3000);
			},
			lazyConnect: false,
			enableOfflineQueue: true,
		});

		global.redisClient.on("error", (err) => {
			if (!global.redisConnectionLogged) {
				console.error("Redis connection error:", err.message);
			}
		});

		global.redisClient.on("connect", () => {
			if (!global.redisConnectionLogged) {
				console.log("Connected to Redis");
				global.redisConnectionLogged = true;
			}
		});

		global.redisClient.on("ready", () => {
			console.log("Redis ready");
		});
	}
	return global.redisClient;
}

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

async function tryAcquireProcessingLock(): Promise<string | null> {
	const token = `${process.pid}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
	const result = await getRedis().set(PROCESSING_KEY, token, "EX", PROCESSING_LOCK_TTL, "NX");

	if (result === "OK") {
		global.currentLockToken = token;
		console.log(`Processing lock acquired with token: ${token}`);
		return token;
	}

	return null;
}

async function releaseProcessingLock(token: string): Promise<boolean> {
	if (!token) return false;

	const luaScript = `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("del", KEYS[1])
		else
			return 0
		end
	`;

	const result = await getRedis().eval(luaScript, 1, PROCESSING_KEY, token);

	if (result === 1) {
		console.log(`Processing lock released for token: ${token}`);
		if (global.currentLockToken === token) {
			global.currentLockToken = null;
		}
		return true;
	}

	console.warn(`Failed to release lock - token mismatch or already released`);
	return false;
}

async function renewProcessingLock(token: string): Promise<void> {
	if (!token) return;

	const luaScript = `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("expire", KEYS[1], ARGV[2])
		else
			return 0
		end
	`;

	const result = await getRedis().eval(luaScript, 1, PROCESSING_KEY, token, PROCESSING_LOCK_TTL);

	if (result === 1) {
		console.log(`Processing lock renewed for token: ${token}`);
	} else {
		console.warn(`Failed to renew lock - token mismatch or expired`);
	}
}

function startHeartbeat(token: string): void {
	stopHeartbeat();

	global.heartbeatInterval = setInterval(() => {
		renewProcessingLock(token).catch((err) => {
			console.error("Error renewing processing lock:", err);
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

	let lockToken: string | null = null;
	let jobId: string | null = null;

	try {
		jobId = await popFromQueue();

		if (!jobId) {
			console.log(`No job found in queue`);
			return;
		}

		const job = await getJob(jobId);
		if (!job) {
			console.warn(`Job ${jobId} not found in storage`);
			return;
		}

		lockToken = await tryAcquireProcessingLock();
		if (!lockToken) {
			await getRedis().lpush(QUEUE_KEY, jobId);
			console.log(`Lock acquisition failed, retrying in 1 second...`);
			setTimeout(() => processNextJob(), 1000);
			return;
		}

		startHeartbeat(lockToken);

		await updateJob(jobId, { status: "processing", startedAt: Date.now() });

		const mediaUrls: Record<string, string> = {};

		const allClips = job.timelineState.tracks.flatMap((track) => track.clips);
		allClips.forEach((clip) => {
			if (!mediaUrls[clip.src]) {
				mediaUrls[clip.src] = clip.src;
			}
		});

		const mediaFiles = await downloadMediaFiles(mediaUrls);
		await updateJob(jobId, { progress: 10 });

		const outputDir = path.join(os.tmpdir(), "editmash", "renders");
		await fs.mkdir(outputDir, { recursive: true });
		const outputFileName = `render_${jobId}.mp4`;
		const outputPath = path.join(outputDir, outputFileName);

		await renderTimeline(job.timelineState, mediaFiles, outputPath, (progress) => {
			const adjustedProgress = 10 + (progress / 100) * 70;
			updateJob(jobId || "", { progress: adjustedProgress }).catch((err) => {
				console.error(`Error updating render progress for job ${jobId}:`, err);
			});
		});

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

		if (job.sourceFileIds && job.sourceFileIds.length > 0) {
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
		}
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
		if (lockToken) {
			stopHeartbeat();
			await releaseProcessingLock(lockToken);

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

export async function closeRedisConnection(): Promise<void> {
	stopHeartbeat();

	if (global.currentLockToken) {
		try {
			await releaseProcessingLock(global.currentLockToken);
		} catch (error) {
			console.error("Error releasing processing lock on shutdown:", error);
		}
	}

	if (global.redisClient) {
		await global.redisClient.quit();
		global.redisClient = undefined;
	}

	console.log("Graceful shutdown completed");
}
