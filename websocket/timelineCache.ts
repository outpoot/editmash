import {
	matchTimelines,
	pendingTimelineSyncs,
	matchClipIdMaps,
	matchConfigs,
	matchPlayerClipCounts,
	pendingBatches,
	BATCH_WINDOW_MS,
	type TimelineClip,
	type CachedTimeline,
} from "./state";
import { getShortClipId, getFullClipId } from "./clipIdMapping";
import { createClipDeltaUpdate, createClipBatchUpdateMessage, type ClipDeltaUpdate } from "./types";

export function updateCacheClipAdded(matchId: string, trackId: string, clip: TimelineClip): void {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) return;

	const track = timeline.tracks.find((t) => t.id === trackId);
	if (!track) return;

	if (track.clips.some((c) => c.id === clip.id)) return;

	track.clips.push(clip);
}

export function updateCacheClipUpdated(matchId: string, trackId: string, clipId: string, updates: Partial<TimelineClip>): void {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) return;

	let track = timeline.tracks.find((t) => t.id === trackId);
	let clipIndex = track?.clips.findIndex((c) => c.id === clipId) ?? -1;

	if (clipIndex === -1) {
		for (const t of timeline.tracks) {
			const idx = t.clips.findIndex((c) => c.id === clipId);
			if (idx !== -1) {
				const [clip] = t.clips.splice(idx, 1);
				const targetTrack = timeline.tracks.find((tr) => tr.id === trackId);
				if (targetTrack && clip) {
					targetTrack.clips.push({ ...clip, ...updates } as TimelineClip);
				}
				return;
			}
		}
		return;
	}

	if (track && clipIndex !== -1) {
		track.clips[clipIndex] = { ...track.clips[clipIndex], ...updates } as TimelineClip;
	}
}

export function updateCacheClipRemoved(matchId: string, trackId: string, clipId: string): void {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) return;

	for (const track of timeline.tracks) {
		const clipIndex = track.clips.findIndex((c) => c.id === clipId);
		if (clipIndex !== -1) {
			track.clips.splice(clipIndex, 1);
			return;
		}
	}
}

export function updateCacheClipSplit(matchId: string, trackId: string, originalClip: TimelineClip, newClip: TimelineClip): void {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) return;

	const track = timeline.tracks.find((t) => t.id === trackId);
	if (!track) return;

	const originalIndex = track.clips.findIndex((c) => c.id === originalClip.id);
	if (originalIndex !== -1) {
		track.clips[originalIndex] = originalClip;
	}

	if (!track.clips.some((c) => c.id === newClip.id)) {
		track.clips.push(newClip);
	}
}

export function getCachedClipTiming(matchId: string, clipId: string): { startTime: number; duration: number } | null {
	const timeline = matchTimelines.get(matchId);
	if (!timeline) return null;

	for (const track of timeline.tracks) {
		const clip = track.clips.find((c) => c.id === clipId);
		if (clip) {
			return { startTime: clip.startTime, duration: clip.duration };
		}
	}
	return null;
}

export function cleanupMatchResources(matchId: string): void {
	const pendingSync = pendingTimelineSyncs.get(matchId);
	if (pendingSync) {
		clearTimeout(pendingSync);
		pendingTimelineSyncs.delete(matchId);
	}

	matchTimelines.delete(matchId);
	matchClipIdMaps.delete(matchId);
	matchConfigs.delete(matchId);
	matchPlayerClipCounts.delete(matchId);

	for (const [key, batch] of pendingBatches.entries()) {
		if (key.startsWith(`${matchId}:`)) {
			clearTimeout(batch.timeout);
			pendingBatches.delete(key);
		}
	}
}

type BroadcastFn = (matchId: string, message: import("./types").WSMessage, excludeConnectionId?: string) => void;

export function flushBatch(matchId: string, connId: string, broadcastFn: BroadcastFn): void {
	const key = `${matchId}:${connId}`;
	const batch = pendingBatches.get(key);
	if (!batch || batch.updates.size === 0) {
		pendingBatches.delete(key);
		return;
	}

	const deltaUpdates: ClipDeltaUpdate[] = [];
	for (const [clipId, update] of batch.updates) {
		const clipInfo = getFullClipId(matchId, update.shortId);
		const originalTrackId = clipInfo?.trackId;
		const newTrackId = originalTrackId && originalTrackId !== update.trackId ? update.trackId : undefined;

		if (newTrackId && clipInfo) {
			const map = matchClipIdMaps.get(matchId);
			if (map) {
				map.shortToFull.set(update.shortId, { fullId: clipInfo.fullId, trackId: newTrackId });
			}
		}

		const delta = createClipDeltaUpdate(update.shortId, {
			startTime: update.changes.startTime,
			duration: update.changes.duration,
			sourceIn: update.changes.sourceIn,
			properties: update.changes.properties as Record<string, unknown> | undefined,
			newTrackId,
		});
		deltaUpdates.push(delta);
	}

	if (deltaUpdates.length > 0) {
		const batchMsg = createClipBatchUpdateMessage(matchId, deltaUpdates, {
			userId: batch.userId,
			username: batch.username,
		});
		broadcastFn(matchId, batchMsg, connId);
	}

	pendingBatches.delete(key);
}

export function queueClipUpdate(
	matchId: string,
	connId: string,
	clipId: string,
	trackId: string,
	changes: Partial<TimelineClip>,
	userId: string,
	username: string,
	broadcastFn: BroadcastFn
): void {
	const key = `${matchId}:${connId}`;
	let batch = pendingBatches.get(key);

	if (!batch) {
		batch = {
			updates: new Map(),
			timeout: setTimeout(() => flushBatch(matchId, connId, broadcastFn), BATCH_WINDOW_MS),
			userId,
			username,
		};
		pendingBatches.set(key, batch);
	}

	const shortId = getShortClipId(matchId, clipId, trackId);

	const existing = batch.updates.get(clipId);
	if (existing) {
		batch.updates.set(clipId, {
			shortId,
			trackId,
			changes: { ...existing.changes, ...changes },
		});
	} else {
		batch.updates.set(clipId, { shortId, trackId, changes });
	}
}
