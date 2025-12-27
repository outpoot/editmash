import { matchClipIdMaps, type ClipIdMap } from "./state";

export function getOrCreateClipIdMap(matchId: string): ClipIdMap {
	let map = matchClipIdMaps.get(matchId);
	if (!map) {
		map = {
			fullToShort: new Map(),
			shortToFull: new Map(),
			nextShortId: 1,
		};
		matchClipIdMaps.set(matchId, map);
	}
	return map;
}

export function getShortClipId(matchId: string, fullId: string, trackId: string): number {
	const map = getOrCreateClipIdMap(matchId);
	let shortId = map.fullToShort.get(fullId);
	if (shortId === undefined) {
		shortId = map.nextShortId++;
		map.fullToShort.set(fullId, shortId);
		map.shortToFull.set(shortId, { fullId, trackId });
	}
	return shortId;
}

export function getFullClipId(matchId: string, shortId: number): { fullId: string; trackId: string } | null {
	const map = matchClipIdMaps.get(matchId);
	return map?.shortToFull.get(shortId) ?? null;
}

export function removeClipIdMapping(matchId: string, fullId: string): void {
	const map = matchClipIdMaps.get(matchId);
	if (!map) return;
	const shortId = map.fullToShort.get(fullId);
	if (shortId !== undefined) {
		map.fullToShort.delete(fullId);
		map.shortToFull.delete(shortId);
	}
}

export function updateClipTrackMapping(matchId: string, shortId: number, newTrackId: string): void {
	const map = matchClipIdMaps.get(matchId);
	if (!map) return;
	const existing = map.shortToFull.get(shortId);
	if (existing) {
		map.shortToFull.set(shortId, { fullId: existing.fullId, trackId: newTrackId });
	}
}
