"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { mediaStore, MediaItem } from "@/app/store/mediaStore";
import { subscribeToMatch, sendMessage } from "@/app/store/wsManager";
import {
	type WSMessage,
	MediaType,
	isMediaUploadedMessage,
	isMediaRemovedMessage,
	isClipAddedMessage,
	isClipUpdatedMessage,
	isClipRemovedMessage,
	isClipSplitMessage,
	isPlayerJoinedMessage,
	isPlayerLeftMessage,
	isPlayerCountMessage,
	isMatchStatusMessage,
	isRequestTimelineSyncMessage,
	isClipSelectionMessage,
	isZoneClipsMessage,
	isClipBatchUpdateMessage,
	isClipIdMappingMessage,
	isErrorMessage,
	isChatBroadcast,
	createMediaUploadedMessage,
	createMediaRemovedMessage,
	createClipAddedMessage,
	createClipUpdatedMessage,
	createClipRemovedMessage,
	createClipSplitMessage,
	createTimelineSyncMessage,
	createClipSelectionMessage,
	createZoneSubscribeMessage,
	createClipBatchUpdateMessage,
	createClipDeltaUpdate,
	computeClipDelta,
	createClipDataProto,
	createTrackProto,
	createTimelineDataProto,
	createChatMessage,
	type ClipDataProto,
	type ClipData,
	type TimelineData,
	type MediaData,
	type Track,
	type ClipDeltaUpdate,
	type ChatMessageData,
} from "@/websocket/types";
import type { Clip } from "@/app/types/timeline";
import type { MatchConfig } from "@/app/types/match";
import {
	validateClipConstraints,
	validatePlayerClipLimit,
	validateClipSplit as validateClipSplitConstraints,
	clampAudioVolume,
	type ClipForValidation,
	type TimelineForValidation,
	type ClipConstraintConfig,
} from "@/lib/clipConstraints";
import { toast } from "sonner";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "failed" | "kicked";

export interface RemoteSelection {
	userId: string;
	username: string;
	userImage?: string;
	highlightColor: string;
	selectedClips: Array<{ clipId: string; trackId: string }>;
}

function buildTimelineProto(timeline: TimelineData) {
	return createTimelineDataProto({
		duration: timeline.duration,
		tracks: timeline.tracks.map((track) =>
			createTrackProto({
				id: track.id,
				type: track.type,
				clips: track.clips.map((clip) => {
					const flatProps = nestedPropertiesToFlat(clip.properties, clip.type);
					return createClipDataProto({
						id: clip.id,
						type: clip.type,
						name: clip.name,
						src: clip.src,
						startTime: clip.startTime,
						duration: clip.duration,
						sourceIn: clip.sourceIn,
						sourceDuration: clip.sourceDuration,
						thumbnail: clip.thumbnail,
						properties: flatProps,
					});
				}),
			})
		),
	});
}

interface MatchWebSocketContextValue {
	status: ConnectionStatus;
	playersOnline: number;
	matchId: string;
	remoteSelections: Map<string, RemoteSelection>;
	matchConfig: ClipConstraintConfig | null;
	playerClipCount: number;
	chatMessages: ChatMessageData[];
	broadcastMediaUploaded: (media: MediaItem) => void;
	broadcastMediaRemoved: (mediaId: string) => void;
	broadcastClipAdded: (trackId: string, clip: Clip, timeline: TimelineForValidation) => boolean;
	broadcastClipUpdated: (trackId: string, clip: Clip) => void;
	broadcastClipRemoved: (trackId: string, clipId: string) => void;
	broadcastClipSplit: (trackId: string, originalClip: Clip, newClip: Clip, timeline: TimelineForValidation) => boolean;
	broadcastClipSelection: (selectedClips: Array<{ clipId: string; trackId: string }>) => void;
	sendTimelineSync: (timeline: TimelineData) => void;
	subscribeToZone: (startTime: number, endTime: number) => void;
	currentZone: { startTime: number; endTime: number } | null;
	validateClipAdd: (clip: Clip, trackId: string, timeline: TimelineForValidation) => { valid: boolean; reason?: string };
	validateClipSplitOp: (
		originalClip: Clip,
		newClip: Clip,
		trackId: string,
		timeline: TimelineForValidation
	) => { valid: boolean; reason?: string };
	sendChatMessage: (message: string) => { success: boolean; error?: string };
	addSystemMessage: (message: string) => void;
}

const MatchWebSocketContext = createContext<MatchWebSocketContextValue | null>(null);

interface MatchWebSocketProviderProps {
	children: React.ReactNode;
	matchId: string;
	userId: string;
	username: string;
	userImage?: string;
	highlightColor?: string;
	matchConfig?: MatchConfig;
	onRemoteMediaUploaded?: (media: MediaData) => void;
	onRemoteClipAdded?: (trackId: string, clip: ClipData, addedBy: { userId: string; username: string }) => void;
	onRemoteClipUpdated?: (
		trackId: string,
		clipId: string,
		updates: Partial<ClipData>,
		updatedBy: { userId: string; username: string },
		oldTrackId?: string
	) => void;
	onRemoteClipRemoved?: (trackId: string, clipId: string, removedBy: { userId: string; username: string }) => void;
	onRemoteClipSplit?: (trackId: string, originalClip: ClipData, newClip: ClipData, splitBy: { userId: string; username: string }) => void;
	onZoneClipsReceived?: (startTime: number, endTime: number, clips: Array<{ trackId: string; clip: ClipData }>) => void;
	onPlayerJoined?: (player: { userId: string; username: string }) => void;
	onPlayerLeft?: (userId: string) => void;
	onConnectionFailed?: () => void;
	onMatchStatusChange?: (status: string) => void;
	onTimelineSyncRequested?: () => TimelineData | null;
	onConstraintViolation?: (reason: string) => void;
	onKicked?: () => void;
}

function mediaTypeToString(type: MediaType): "video" | "audio" | "image" {
	switch (type) {
		case MediaType.VIDEO:
			return "video";
		case MediaType.AUDIO:
			return "audio";
		case MediaType.IMAGE:
			return "image";
		default:
			return "video";
	}
}

export function flatPropertiesToNested(
	flat: Record<string, unknown> | undefined,
	clipType: "video" | "audio" | "image"
): Record<string, unknown> {
	if (!flat) return {};

	if (clipType === "audio") {
		return {
			volume: flat.volume ?? 1,
			pan: flat.pan ?? 0,
			pitch: flat.pitch ?? 0,
			speed: flat.speed ?? 1,
		};
	}

	return {
		position: {
			x: flat.x ?? 0,
			y: flat.y ?? 0,
		},
		size: {
			width: flat.width ?? 1920,
			height: flat.height ?? 1080,
		},
		zoom: {
			x: flat.zoomX ?? 1,
			y: flat.zoomY ?? 1,
			linked: flat.zoomLinked ?? true,
		},
		rotation: flat.rotation ?? 0,
		flip: {
			horizontal: flat.flipX ?? false,
			vertical: flat.flipY ?? false,
		},
		crop: {
			left: flat.cropLeft ?? 0,
			right: flat.cropRight ?? 0,
			top: flat.cropTop ?? 0,
			bottom: flat.cropBottom ?? 0,
		},
		speed: flat.speed ?? 1,
		freezeFrame: flat.freezeFrame ?? false,
		freezeFrameTime: flat.freezeFrameTime ?? 0,
	};
}

export function flatPropertiesToNestedPartial(
	flat: Record<string, unknown> | undefined,
	clipType: "video" | "audio" | "image"
): Record<string, unknown> {
	if (!flat) return {};

	const result: Record<string, unknown> = {};

	if (clipType === "audio") {
		if (flat.volume !== undefined) result.volume = flat.volume;
		if (flat.pan !== undefined) result.pan = flat.pan;
		if (flat.pitch !== undefined) result.pitch = flat.pitch;
		if (flat.speed !== undefined) result.speed = flat.speed;
		return result;
	}

	if (flat.x !== undefined || flat.y !== undefined) {
		result.position = {
			...(flat.x !== undefined && { x: flat.x }),
			...(flat.y !== undefined && { y: flat.y }),
		};
	}

	if (flat.width !== undefined || flat.height !== undefined) {
		result.size = {
			...(flat.width !== undefined && { width: flat.width }),
			...(flat.height !== undefined && { height: flat.height }),
		};
	}

	if (flat.zoomX !== undefined || flat.zoomY !== undefined || flat.zoomLinked !== undefined) {
		result.zoom = {
			...(flat.zoomX !== undefined && { x: flat.zoomX }),
			...(flat.zoomY !== undefined && { y: flat.zoomY }),
			...(flat.zoomLinked !== undefined && { linked: flat.zoomLinked }),
		};
	}

	if (flat.rotation !== undefined) result.rotation = flat.rotation;

	if (flat.flipX !== undefined || flat.flipY !== undefined) {
		result.flip = {
			...(flat.flipX !== undefined && { horizontal: flat.flipX }),
			...(flat.flipY !== undefined && { vertical: flat.flipY }),
		};
	}

	if (flat.cropLeft !== undefined || flat.cropRight !== undefined || flat.cropTop !== undefined || flat.cropBottom !== undefined) {
		result.crop = {
			...(flat.cropLeft !== undefined && { left: flat.cropLeft }),
			...(flat.cropRight !== undefined && { right: flat.cropRight }),
			...(flat.cropTop !== undefined && { top: flat.cropTop }),
			...(flat.cropBottom !== undefined && { bottom: flat.cropBottom }),
		};
	}

	if (flat.speed !== undefined) result.speed = flat.speed;
	if (flat.freezeFrame !== undefined) result.freezeFrame = flat.freezeFrame;
	if (flat.freezeFrameTime !== undefined) result.freezeFrameTime = flat.freezeFrameTime;

	return result;
}

export function nestedPropertiesToFlat(
	nested: Record<string, unknown> | undefined,
	clipType: "video" | "audio" | "image"
): Record<string, unknown> {
	if (!nested) return {};

	if (clipType === "audio") {
		return {
			volume: nested.volume ?? 1,
			pan: nested.pan ?? 0,
			pitch: nested.pitch ?? 0,
			speed: nested.speed ?? 1,
		};
	}

	const position = (nested.position as { x?: number; y?: number }) ?? {};
	const size = (nested.size as { width?: number; height?: number }) ?? {};
	const zoom = (nested.zoom as { x?: number; y?: number; linked?: boolean }) ?? {};
	const flip = (nested.flip as { horizontal?: boolean; vertical?: boolean }) ?? {};
	const crop = (nested.crop as { left?: number; right?: number; top?: number; bottom?: number }) ?? {};

	return {
		x: position.x ?? 0,
		y: position.y ?? 0,
		width: size.width ?? 1920,
		height: size.height ?? 1080,
		zoomX: zoom.x ?? 1,
		zoomY: zoom.y ?? 1,
		zoomLinked: zoom.linked ?? true,
		rotation: nested.rotation ?? 0,
		flipX: flip.horizontal ?? false,
		flipY: flip.vertical ?? false,
		cropLeft: crop.left ?? 0,
		cropRight: crop.right ?? 0,
		cropTop: crop.top ?? 0,
		cropBottom: crop.bottom ?? 0,
		speed: nested.speed ?? 1,
		freezeFrame: nested.freezeFrame ?? false,
		freezeFrameTime: nested.freezeFrameTime ?? 0,
	};
}

function clipDataFromProto(clip: ClipDataProto): ClipData {
	const clipType = mediaTypeToString(clip.type);
	const flatProps = clip.properties
		? {
				x: clip.properties.x,
				y: clip.properties.y,
				width: clip.properties.width,
				height: clip.properties.height,
				opacity: clip.properties.opacity,
				rotation: clip.properties.rotation,
				scale: clip.properties.scale,
				speed: clip.properties.speed,
				flipX: clip.properties.flipX,
				flipY: clip.properties.flipY,
				zoomX: clip.properties.zoomX,
				zoomY: clip.properties.zoomY,
				zoomLinked: clip.properties.zoomLinked,
				freezeFrame: clip.properties.freezeFrame,
				freezeFrameTime: clip.properties.freezeFrameTime,
				volume: clip.properties.volume,
				pan: clip.properties.pan,
				pitch: clip.properties.pitch,
				cropTop: clip.properties.cropTop,
				cropBottom: clip.properties.cropBottom,
				cropLeft: clip.properties.cropLeft,
				cropRight: clip.properties.cropRight,
		  }
		: undefined;

	return {
		id: clip.id,
		type: clipType,
		name: clip.name,
		src: clip.src,
		startTime: clip.startTime,
		duration: clip.duration,
		sourceIn: clip.sourceIn,
		sourceDuration: clip.sourceDuration,
		thumbnail: clip.thumbnail,
		properties: flatPropertiesToNested(flatProps, clipType),
	};
}

export function MatchWS({
	children,
	matchId,
	userId,
	username,
	userImage,
	highlightColor = "#3b82f6",
	matchConfig,
	onRemoteMediaUploaded,
	onRemoteClipAdded,
	onRemoteClipUpdated,
	onRemoteClipRemoved,
	onRemoteClipSplit,
	onZoneClipsReceived,
	onPlayerJoined,
	onPlayerLeft,
	onConnectionFailed,
	onMatchStatusChange,
	onTimelineSyncRequested,
	onConstraintViolation,
	onKicked,
}: MatchWebSocketProviderProps) {
	const [status, setStatus] = useState<ConnectionStatus>("disconnected");
	const [playersOnline, setPlayersOnline] = useState(0);
	const [remoteSelections, setRemoteSelections] = useState<Map<string, RemoteSelection>>(new Map());
	const [currentZone, setCurrentZone] = useState<{ startTime: number; endTime: number } | null>(null);
	const [playerClipCount, setPlayerClipCount] = useState(0);
	const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
	const hasReceivedInitialCount = useRef(false);

	const constraintConfig: ClipConstraintConfig | null = matchConfig
		? {
				timelineDuration: matchConfig.timelineDuration,
				clipSizeMin: matchConfig.clipSizeMin,
				clipSizeMax: matchConfig.clipSizeMax,
				audioMaxDb: matchConfig.audioMaxDb,
				maxVideoTracks: matchConfig.maxVideoTracks,
				maxAudioTracks: matchConfig.maxAudioTracks,
				maxClipsPerUser: matchConfig.maxClipsPerUser,
				constraints: matchConfig.constraints,
		  }
		: null;

	const clipIdMapRef = useRef<{
		fullToShort: Map<string, number>;
		shortToFull: Map<number, { fullId: string; trackId: string; clipType: "video" | "audio" | "image" }>;
	}>({
		fullToShort: new Map(),
		shortToFull: new Map(),
	});

	const BATCH_WINDOW_MS = 50; // ms
	const pendingUpdatesRef = useRef<
		Map<
			string,
			{
				clip: Clip;
				trackId: string;
				previousState: { startTime: number; duration: number; sourceIn: number; properties: Record<string, unknown> };
			}
		>
	>(new Map());
	const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const flushPendingUpdatesRef = useRef<(() => void) | null>(null);

	const clipStatesRef = useRef<
		Map<
			string,
			{
				startTime: number;
				duration: number;
				sourceIn: number;
				properties: Record<string, unknown>;
			}
		>
	>(new Map());

	const callbacksRef = useRef({
		onRemoteMediaUploaded,
		onRemoteClipAdded,
		onRemoteClipUpdated,
		onRemoteClipRemoved,
		onRemoteClipSplit,
		onZoneClipsReceived,
		onPlayerJoined,
		onPlayerLeft,
		onConnectionFailed,
		onMatchStatusChange,
		onTimelineSyncRequested,
		onConstraintViolation,
		onKicked,
	});
	callbacksRef.current = {
		onRemoteMediaUploaded,
		onRemoteClipAdded,
		onRemoteClipUpdated,
		onRemoteClipRemoved,
		onRemoteClipSplit,
		onZoneClipsReceived,
		onPlayerJoined,
		onPlayerLeft,
		onConnectionFailed,
		onMatchStatusChange,
		onTimelineSyncRequested,
		onConstraintViolation,
		onKicked,
	};

	const propsRef = useRef({ matchId, userId, username, userImage, highlightColor });
	propsRef.current = { matchId, userId, username, userImage, highlightColor };

	useEffect(() => {
		setPlayersOnline(0);
		hasReceivedInitialCount.current = false;
	}, [matchId]);

	useEffect(() => {
		return () => {
			try {
				if (batchTimeoutRef.current) {
					clearTimeout(batchTimeoutRef.current);
				}
				flushPendingUpdatesRef.current?.();
			} catch (error) {
				console.error("[MatchWS] Error flushing pending updates on cleanup:", error);
				batchTimeoutRef.current = null;
				pendingUpdatesRef.current.clear();
			}
		};
	}, [matchId]);

	useEffect(() => {
		const fetchInitialPlayerCount = async () => {
			try {
				const response = await fetch(`/api/matches/${matchId}/status`);
				if (response.ok) {
					const data = await response.json();
					if (typeof data.playerCount === "number" && !hasReceivedInitialCount.current) {
						hasReceivedInitialCount.current = true;
						setPlayersOnline(data.playerCount);
					}
				}
			} catch (error) {
				console.error("[MatchWS] Failed to fetch initial player count:", error);
			}
		};

		fetchInitialPlayerCount();
	}, [matchId]);

	useEffect(() => {
		const handleMessage = (message: WSMessage) => {
			const { userId } = propsRef.current;

			if (isPlayerCountMessage(message) && message.payload.case === "playerCount") {
				hasReceivedInitialCount.current = true;
				setPlayersOnline(message.payload.value.count);
				return;
			}

			if (isMediaUploadedMessage(message) && message.payload.case === "mediaUploaded") {
				const { media } = message.payload.value;
				if (media && media.uploadedBy && media.uploadedBy.userId !== userId) {
					const mediaData: MediaData = {
						id: media.id,
						name: media.name,
						type: mediaTypeToString(media.type),
						url: media.url,
						uploadedBy: { userId: media.uploadedBy.userId, username: media.uploadedBy.username },
					};
					mediaStore.addRemoteItem(media.id, media.name, mediaTypeToString(media.type), media.url, false, media.uploadedBy.userId, media.uploadedBy.username);
					callbacksRef.current.onRemoteMediaUploaded?.(mediaData);
				}
				return;
			}

			if (isMediaRemovedMessage(message) && message.payload.case === "mediaRemoved") {
				const { mediaId, removedBy } = message.payload.value;
				if (removedBy !== userId) {
					mediaStore.removeItem(mediaId);
				}
				return;
			}

			if (isClipAddedMessage(message) && message.payload.case === "clipAdded") {
				const { trackId, clip, addedBy } = message.payload.value;
				if (clip && addedBy && addedBy.userId !== userId) {
					callbacksRef.current.onRemoteClipAdded?.(trackId, clipDataFromProto(clip), {
						userId: addedBy.userId,
						username: addedBy.username,
					});
				}
				return;
			}

			if (isClipUpdatedMessage(message) && message.payload.case === "clipUpdated") {
				const { trackId, clipId, updates, updatedBy } = message.payload.value;
				if (updates && updatedBy && updatedBy.userId !== userId) {
					callbacksRef.current.onRemoteClipUpdated?.(trackId, clipId, clipDataFromProto(updates), {
						userId: updatedBy.userId,
						username: updatedBy.username,
					});
				}
				return;
			}

			if (isClipRemovedMessage(message) && message.payload.case === "clipRemoved") {
				const { trackId, clipId, removedBy } = message.payload.value;
				if (removedBy && removedBy.userId !== userId) {
					callbacksRef.current.onRemoteClipRemoved?.(trackId, clipId, { userId: removedBy.userId, username: removedBy.username });
				}
				return;
			}

			if (isClipSplitMessage(message) && message.payload.case === "clipSplit") {
				const { trackId, originalClip, newClip, splitBy } = message.payload.value;
				if (originalClip && newClip && splitBy && splitBy.userId !== userId) {
					callbacksRef.current.onRemoteClipSplit?.(trackId, clipDataFromProto(originalClip), clipDataFromProto(newClip), {
						userId: splitBy.userId,
						username: splitBy.username,
					});
				}
				return;
			}

			if (isPlayerJoinedMessage(message) && message.payload.case === "playerJoined") {
				const { player } = message.payload.value;
				if (player) {
					setPlayersOnline((n) => n + 1);
					callbacksRef.current.onPlayerJoined?.({ userId: player.userId, username: player.username });
				}
				return;
			}

			if (isPlayerLeftMessage(message) && message.payload.case === "playerLeft") {
				const { userId: leftUserId } = message.payload.value;
				setPlayersOnline((n) => Math.max(0, n - 1));
				// Remove selections when player leaves
				setRemoteSelections((prev) => {
					const next = new Map(prev);
					next.delete(leftUserId);
					return next;
				});
				callbacksRef.current.onPlayerLeft?.(leftUserId);
				return;
			}

			if (isMatchStatusMessage(message) && message.payload.case === "matchStatus") {
				callbacksRef.current.onMatchStatusChange?.(message.payload.value.status);
				return;
			}

			if (isClipSelectionMessage(message) && message.payload.case === "clipSelection") {
				const {
					userId: selUserId,
					username: selUsername,
					userImage: selUserImage,
					highlightColor: selHighlightColor,
					selectedClips,
				} = message.payload.value;

				if (!selUserId || selUserId === userId) {
					return;
				}

				const validUsername = typeof selUsername === "string" && selUsername.length > 0 ? selUsername : "Unknown";
				const validHighlightColor =
					typeof selHighlightColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(selHighlightColor) ? selHighlightColor : "#3b82f6";
				const validSelectedClips = Array.isArray(selectedClips) ? selectedClips : [];

				setRemoteSelections((prev) => {
					const next = new Map(prev);
					if (validSelectedClips.length === 0) {
						next.delete(selUserId);
					} else {
						next.set(selUserId, {
							userId: selUserId,
							username: validUsername,
							userImage: selUserImage,
							highlightColor: validHighlightColor,
							selectedClips: validSelectedClips.map((s) => ({
								clipId: s.clipId ?? "",
								trackId: s.trackId ?? "",
							})),
						});
					}
					return next;
				});
				return;
			}

			if (isRequestTimelineSyncMessage(message) && message.payload.case === "requestTimelineSync") {
				const timeline = callbacksRef.current.onTimelineSyncRequested?.();
				if (timeline) {
					const { matchId, userId } = propsRef.current;
					sendMessage(matchId, userId, createTimelineSyncMessage(matchId, buildTimelineProto(timeline)));
				}
				return;
			}

			if (isZoneClipsMessage(message) && message.payload.case === "zoneClips") {
				const { startTime, endTime } = message.payload.value;
				const tracks = Array.isArray(message.payload.value.tracks) ? message.payload.value.tracks : [];
				const clips: Array<{ trackId: string; clip: ClipData }> = [];

				for (const track of tracks) {
					if (!track || !Array.isArray(track.clips)) continue;
					for (const clip of track.clips) {
						clips.push({
							trackId: track.id,
							clip: clipDataFromProto(clip),
						});
					}
				}

				callbacksRef.current.onZoneClipsReceived?.(startTime, endTime, clips);
				return;
			}

			if (isClipIdMappingMessage(message) && message.payload.case === "clipIdMapping") {
				const { mappings } = message.payload.value;
				if (mappings) {
					for (const mapping of mappings) {
						const clipType = mapping.clipType === 1 ? "video" : mapping.clipType === 2 ? "audio" : "image";
						clipIdMapRef.current.fullToShort.set(mapping.fullId, mapping.shortId);
						clipIdMapRef.current.shortToFull.set(mapping.shortId, {
							fullId: mapping.fullId,
							trackId: mapping.trackId,
							clipType,
						});
					}
				}
				return;
			}

			if (isClipBatchUpdateMessage(message) && message.payload.case === "clipBatchUpdate") {
				const { updates, updatedBy } = message.payload.value;
				if (updates && updatedBy && updatedBy.userId !== userId) {
					for (const delta of updates) {
						const clipInfo = clipIdMapRef.current.shortToFull.get(delta.shortId);
						if (!clipInfo) {
							console.warn(`[MatchWS] Unknown short clip ID ${delta.shortId} in batch update`);
							continue;
						}

						const originalTrackId = clipInfo.trackId;
						const newTrackId = delta.newTrackId;

						if (newTrackId && newTrackId !== originalTrackId) {
							clipIdMapRef.current.shortToFull.set(delta.shortId, {
								...clipInfo,
								trackId: newTrackId,
							});
						}

						const partialUpdate: Partial<ClipData> = {
							id: clipInfo.fullId,
						};
						if (delta.startTime !== undefined) partialUpdate.startTime = delta.startTime;
						if (delta.duration !== undefined) partialUpdate.duration = delta.duration;
						if (delta.sourceIn !== undefined) partialUpdate.sourceIn = delta.sourceIn;
						if (delta.properties) {
							partialUpdate.properties = flatPropertiesToNestedPartial(
								delta.properties as unknown as Record<string, unknown>,
								clipInfo.clipType
							);
						}

						const targetTrackId = newTrackId || originalTrackId;

						callbacksRef.current.onRemoteClipUpdated?.(
							targetTrackId,
							clipInfo.fullId,
							partialUpdate,
							{
								userId: updatedBy.userId,
								username: updatedBy.username,
							},
							originalTrackId !== targetTrackId ? originalTrackId : undefined
						);
					}
				}
				return;
			}

			if (isErrorMessage(message) && message.payload.case === "error") {
				const { code, message: errorMessage } = message.payload.value;
				if (code === "CONSTRAINT_VIOLATION") {
					toast.error(errorMessage || "Clip operation rejected");
					callbacksRef.current.onConstraintViolation?.(errorMessage);
				} else if (code === "VOTE_KICKED") {
					callbacksRef.current.onKicked?.();
				}
				return;
			}

			if (isChatBroadcast(message) && message.payload.case === "chatBroadcast") {
				const {
					messageId,
					userId: msgUserId,
					username: msgUsername,
					userImage,
					highlightColor,
					message: msgText,
					timestamp,
				} = message.payload.value;
				const chatMessage: ChatMessageData = {
					messageId,
					userId: msgUserId,
					username: msgUsername,
					userImage: userImage ?? undefined,
					highlightColor,
					message: msgText,
					timestamp: Number(timestamp),
				};
				setChatMessages((prev) => {
					const newMessages = [...prev, chatMessage];
					if (newMessages.length > 100) {
						return newMessages.slice(-100);
					}
					return newMessages;
				});
				return;
			}
		};

		const handleStatus = (newStatus: ConnectionStatus) => {
			setStatus(newStatus);
			if (newStatus === "failed") {
				callbacksRef.current.onConnectionFailed?.();
			} else if (newStatus === "kicked") {
				callbacksRef.current.onKicked?.();
			}
		};

		const unsubscribe = subscribeToMatch(matchId, userId, username, userImage, highlightColor, handleMessage, handleStatus);

		return unsubscribe;
	}, [matchId, userId, username, userImage, highlightColor]);

	const broadcastMediaUploaded = useCallback((media: MediaItem) => {
		const { matchId, userId, username } = propsRef.current;
		sendMessage(
			matchId,
			userId,
			createMediaUploadedMessage(matchId, {
				id: media.id,
				name: media.name,
				type: media.type,
				url: media.url,
				uploadedBy: { userId, username },
			})
		);
	}, []);

	const broadcastMediaRemoved = useCallback((mediaId: string) => {
		const { matchId, userId } = propsRef.current;
		sendMessage(matchId, userId, createMediaRemovedMessage(matchId, mediaId, userId));
	}, []);

	const broadcastClipAdded = useCallback(
		(trackId: string, clip: Clip, timeline: TimelineForValidation): boolean => {
			const { matchId, userId, username } = propsRef.current;

			if (constraintConfig) {
				const clipForValidation: ClipForValidation = {
					id: clip.id,
					type: clip.type,
					startTime: clip.startTime,
					duration: clip.duration,
					properties: clip.type === "audio" ? { volume: (clip.properties as { volume?: number }).volume } : undefined,
				};

				const validationResult = validateClipConstraints(clipForValidation, constraintConfig, timeline, trackId);
				if (!validationResult.valid) {
					toast.error(validationResult.reason || "Invalid clip");
					return false;
				}
			}

			const flatProperties = nestedPropertiesToFlat(clip.properties as unknown as Record<string, unknown>, clip.type);
			const clipData = createClipDataProto({
				id: clip.id,
				type: clip.type,
				name: clip.name,
				src: clip.src,
				startTime: clip.startTime,
				duration: clip.duration,
				sourceIn: clip.sourceIn,
				sourceDuration: clip.sourceDuration,
				properties: flatProperties,
			});
			sendMessage(matchId, userId, createClipAddedMessage(matchId, trackId, clipData, { userId, username }));

			setPlayerClipCount((count) => count + 1);

			clipStatesRef.current.set(clip.id, {
				startTime: clip.startTime,
				duration: clip.duration,
				sourceIn: clip.sourceIn,
				properties: flatProperties,
			});

			return true;
		},
		[constraintConfig, playerClipCount]
	);

	const flushPendingUpdates = useCallback(() => {
		const { matchId, userId, username } = propsRef.current;
		const pendingUpdates = pendingUpdatesRef.current;

		if (pendingUpdates.size === 0) return;

		const deltaUpdates: ClipDeltaUpdate[] = [];

		for (const [clipId, { clip, trackId, previousState }] of pendingUpdates) {
			const shortId = clipIdMapRef.current.fullToShort.get(clipId);
			if (shortId === undefined) {
				const flatProperties = nestedPropertiesToFlat(clip.properties as unknown as Record<string, unknown>, clip.type);
				const updateData = createClipDataProto({
					id: clip.id,
					type: clip.type,
					name: clip.name,
					src: clip.src,
					startTime: clip.startTime,
					duration: clip.duration,
					sourceIn: clip.sourceIn,
					sourceDuration: clip.sourceDuration,
					properties: flatProperties,
				});
				sendMessage(matchId, userId, createClipUpdatedMessage(matchId, trackId, clip.id, updateData, { userId, username }));
				continue;
			}

			const clipInfo = clipIdMapRef.current.shortToFull.get(shortId);
			const previousTrackId = clipInfo?.trackId;
			const newTrackId = previousTrackId && previousTrackId !== trackId ? trackId : undefined;

			if (newTrackId && clipInfo) {
				clipIdMapRef.current.shortToFull.set(shortId, {
					...clipInfo,
					trackId: newTrackId,
				});
			}

			const currentFlatProps = nestedPropertiesToFlat(clip.properties as unknown as Record<string, unknown>, clip.type);
			const delta = computeClipDelta(previousState, {
				startTime: clip.startTime,
				duration: clip.duration,
				sourceIn: clip.sourceIn,
				properties: currentFlatProps,
			});

			if (delta || newTrackId) {
				deltaUpdates.push(
					createClipDeltaUpdate(shortId, {
						...delta,
						newTrackId,
					})
				);
			}

			clipStatesRef.current.set(clipId, {
				startTime: clip.startTime,
				duration: clip.duration,
				sourceIn: clip.sourceIn,
				properties: currentFlatProps,
			});
		}

		if (deltaUpdates.length > 0) {
			sendMessage(matchId, userId, createClipBatchUpdateMessage(matchId, deltaUpdates, { userId, username }));
		}

		pendingUpdatesRef.current.clear();
		batchTimeoutRef.current = null;
	}, []);

	flushPendingUpdatesRef.current = flushPendingUpdates;

	const broadcastClipUpdated = useCallback(
		(trackId: string, clip: Clip) => {
			const { matchId, userId, username } = propsRef.current;

			const previousState = clipStatesRef.current.get(clip.id);

			if (!previousState) {
				const flatProperties = nestedPropertiesToFlat(clip.properties as unknown as Record<string, unknown>, clip.type);
				const updateData = createClipDataProto({
					id: clip.id,
					type: clip.type,
					name: clip.name,
					src: clip.src,
					startTime: clip.startTime,
					duration: clip.duration,
					sourceIn: clip.sourceIn,
					sourceDuration: clip.sourceDuration,
					properties: flatProperties,
				});
				sendMessage(matchId, userId, createClipUpdatedMessage(matchId, trackId, clip.id, updateData, { userId, username }));

				clipStatesRef.current.set(clip.id, {
					startTime: clip.startTime,
					duration: clip.duration,
					sourceIn: clip.sourceIn,
					properties: flatProperties,
				});
				return;
			}

			pendingUpdatesRef.current.set(clip.id, {
				clip,
				trackId,
				previousState,
			});

			if (!batchTimeoutRef.current) {
				batchTimeoutRef.current = setTimeout(flushPendingUpdates, BATCH_WINDOW_MS);
			}
		},
		[flushPendingUpdates]
	);

	const broadcastClipRemoved = useCallback((trackId: string, clipId: string) => {
		const { matchId, userId, username } = propsRef.current;
		sendMessage(matchId, userId, createClipRemovedMessage(matchId, trackId, clipId, { userId, username }));

		setPlayerClipCount((count) => Math.max(0, count - 1));

		clipStatesRef.current.delete(clipId);
		pendingUpdatesRef.current.delete(clipId);

		const shortId = clipIdMapRef.current.fullToShort.get(clipId);
		if (shortId !== undefined) {
			clipIdMapRef.current.fullToShort.delete(clipId);
			clipIdMapRef.current.shortToFull.delete(shortId);
		}
	}, []);

	const broadcastClipSplit = useCallback(
		(trackId: string, originalClip: Clip, newClip: Clip, timeline: TimelineForValidation): boolean => {
			const { matchId, userId, username } = propsRef.current;

			if (constraintConfig) {
				const originalForValidation: ClipForValidation = {
					id: originalClip.id,
					type: originalClip.type,
					startTime: originalClip.startTime,
					duration: originalClip.duration,
					properties: originalClip.type === "audio" ? { volume: (originalClip.properties as { volume?: number }).volume } : undefined,
				};

				const newForValidation: ClipForValidation = {
					id: newClip.id,
					type: newClip.type,
					startTime: newClip.startTime,
					duration: newClip.duration,
					properties: newClip.type === "audio" ? { volume: (newClip.properties as { volume?: number }).volume } : undefined,
				};

				const validationResult = validateClipSplitConstraints(originalForValidation, newForValidation, constraintConfig, timeline, trackId);
				if (!validationResult.valid) {
					toast.error(validationResult.reason || "Invalid split");
					return false;
				}
			}

			const originalFlatProps = nestedPropertiesToFlat(originalClip.properties as unknown as Record<string, unknown>, originalClip.type);
			const originalData = createClipDataProto({
				id: originalClip.id,
				type: originalClip.type,
				name: originalClip.name,
				src: originalClip.src,
				startTime: originalClip.startTime,
				duration: originalClip.duration,
				sourceIn: originalClip.sourceIn,
				sourceDuration: originalClip.sourceDuration,
				properties: originalFlatProps,
			});

			const newFlatProps = nestedPropertiesToFlat(newClip.properties as unknown as Record<string, unknown>, newClip.type);
			const newClipData = createClipDataProto({
				id: newClip.id,
				type: newClip.type,
				name: newClip.name,
				src: newClip.src,
				startTime: newClip.startTime,
				duration: newClip.duration,
				sourceIn: newClip.sourceIn,
				sourceDuration: newClip.sourceDuration,
				properties: newFlatProps,
			});

			sendMessage(matchId, userId, createClipSplitMessage(matchId, trackId, originalData, newClipData, { userId, username }));

			setPlayerClipCount((count) => count + 1);

			return true;
		},
		[constraintConfig, playerClipCount]
	);

	const broadcastClipSelection = useCallback((selectedClips: Array<{ clipId: string; trackId: string }>) => {
		const { matchId, userId, username, userImage, highlightColor } = propsRef.current;
		sendMessage(matchId, userId, createClipSelectionMessage(matchId, userId, username, userImage, highlightColor, selectedClips));
	}, []);

	const sendTimelineSync = useCallback((timeline: TimelineData) => {
		const { matchId, userId } = propsRef.current;
		sendMessage(matchId, userId, createTimelineSyncMessage(matchId, buildTimelineProto(timeline)));
	}, []);

	const subscribeToZone = useCallback((startTime: number, endTime: number) => {
		const { matchId, userId } = propsRef.current;
		setCurrentZone({ startTime, endTime });
		sendMessage(matchId, userId, createZoneSubscribeMessage(matchId, startTime, endTime));
	}, []);

	const validateClipAdd = useCallback(
		(clip: Clip, trackId: string, timeline: TimelineForValidation): { valid: boolean; reason?: string } => {
			if (!constraintConfig) {
				return { valid: true };
			}

			const clipForValidation: ClipForValidation = {
				id: clip.id,
				type: clip.type,
				startTime: clip.startTime,
				duration: clip.duration,
				properties: clip.type === "audio" ? { volume: (clip.properties as { volume?: number }).volume } : undefined,
			};

			return validateClipConstraints(clipForValidation, constraintConfig, timeline, trackId);
		},
		[constraintConfig, playerClipCount]
	);

	const validateClipSplitOp = useCallback(
		(originalClip: Clip, newClip: Clip, trackId: string, timeline: TimelineForValidation): { valid: boolean; reason?: string } => {
			if (!constraintConfig) {
				return { valid: true };
			}

			const originalForValidation: ClipForValidation = {
				id: originalClip.id,
				type: originalClip.type,
				startTime: originalClip.startTime,
				duration: originalClip.duration,
				properties: originalClip.type === "audio" ? { volume: (originalClip.properties as { volume?: number }).volume } : undefined,
			};

			const newForValidation: ClipForValidation = {
				id: newClip.id,
				type: newClip.type,
				startTime: newClip.startTime,
				duration: newClip.duration,
				properties: newClip.type === "audio" ? { volume: (newClip.properties as { volume?: number }).volume } : undefined,
			};

			return validateClipSplitConstraints(originalForValidation, newForValidation, constraintConfig, timeline, trackId);
		},
		[constraintConfig, playerClipCount]
	);

	const chatRateLimitRef = useRef<{ lastMessageTime: number; messageCount: number; windowStart: number }>({
		lastMessageTime: 0,
		messageCount: 0,
		windowStart: Date.now(),
	});

	const CHAT_RATE_LIMIT_WINDOW = 10000;
	const CHAT_RATE_LIMIT_MAX_MESSAGES = 5;
	const CHAT_COOLDOWN_MS = 1000;

	const addSystemMessage = useCallback((message: string) => {
		const systemMessage: ChatMessageData = {
			messageId: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
			userId: "system",
			username: "System",
			userImage: undefined,
			highlightColor: "#f59e0b",
			message,
			timestamp: Date.now(),
		};
		setChatMessages((prev) => {
			const newMessages = [...prev, systemMessage];
			if (newMessages.length > 100) {
				return newMessages.slice(-100);
			}
			return newMessages;
		});
	}, []);

	const sendChatMessage = useCallback(
		(message: string): { success: boolean; error?: string } => {
			const { matchId, userId } = propsRef.current;
			const trimmed = message.trim();
			if (!trimmed) return { success: false, error: "Message is empty" };

			const now = Date.now();
			const rateData = chatRateLimitRef.current;

			if (now - rateData.windowStart > CHAT_RATE_LIMIT_WINDOW) {
				rateData.windowStart = now;
				rateData.messageCount = 0;
			}

			if (now - rateData.lastMessageTime < CHAT_COOLDOWN_MS) {
				const error = "You're sending messages too fast";
				addSystemMessage(error);
				return { success: false, error };
			}

			if (rateData.messageCount >= CHAT_RATE_LIMIT_MAX_MESSAGES) {
				const timeLeft = Math.ceil((rateData.windowStart + CHAT_RATE_LIMIT_WINDOW - now) / 1000);
				const error = `Too many messages. Try again in ${timeLeft}s`;
				addSystemMessage(error);
				return { success: false, error };
			}

			rateData.lastMessageTime = now;
			rateData.messageCount++;

			sendMessage(matchId, userId, createChatMessage(matchId, trimmed));
			return { success: true };
		},
		[addSystemMessage]
	);

	const value: MatchWebSocketContextValue = {
		status,
		playersOnline,
		matchId,
		remoteSelections,
		matchConfig: constraintConfig,
		playerClipCount,
		chatMessages,
		broadcastMediaUploaded,
		broadcastMediaRemoved,
		broadcastClipAdded,
		broadcastClipUpdated,
		broadcastClipRemoved,
		broadcastClipSplit,
		broadcastClipSelection,
		sendTimelineSync,
		subscribeToZone,
		currentZone,
		validateClipAdd,
		validateClipSplitOp,
		sendChatMessage,
		addSystemMessage,
	};

	return <MatchWebSocketContext.Provider value={value}>{children}</MatchWebSocketContext.Provider>;
}

export function useMatchWebSocket(): MatchWebSocketContextValue {
	const context = useContext(MatchWebSocketContext);
	if (!context) {
		throw new Error("useMatchWebSocket must be used within a MatchWebSocketProvider");
	}
	return context;
}

export function useMatchWebSocketOptional(): MatchWebSocketContextValue | null {
	return useContext(MatchWebSocketContext);
}
