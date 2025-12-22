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
	isPlayerJoinedMessage,
	isPlayerLeftMessage,
	isPlayerCountMessage,
	isMatchStatusMessage,
	isRequestTimelineSyncMessage,
	createMediaUploadedMessage,
	createMediaRemovedMessage,
	createClipAddedMessage,
	createClipUpdatedMessage,
	createClipRemovedMessage,
	createTimelineSyncMessage,
	createClipDataProto,
	createTrackProto,
	createTimelineDataProto,
	type ClipDataProto,
	type ClipData,
	type TimelineData,
	type MediaData,
} from "@/websocket/types";
import type { Clip } from "@/app/types/timeline";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "failed";

function buildTimelineProto(timeline: TimelineData) {
	return createTimelineDataProto({
		duration: timeline.duration,
		tracks: timeline.tracks.map((track) =>
			createTrackProto({
				id: track.id,
				type: track.type,
				clips: track.clips.map((clip) =>
					createClipDataProto({
						id: clip.id,
						type: clip.type,
						name: clip.name,
						src: clip.src,
						startTime: clip.startTime,
						duration: clip.duration,
						sourceIn: clip.sourceIn,
						sourceDuration: clip.sourceDuration,
						thumbnail: clip.thumbnail,
						properties: clip.properties,
					})
				),
			})
		),
	});
}

interface MatchWebSocketContextValue {
	status: ConnectionStatus;
	playersOnline: number;
	matchId: string;
	broadcastMediaUploaded: (media: MediaItem) => void;
	broadcastMediaRemoved: (mediaId: string) => void;
	broadcastClipAdded: (trackId: string, clip: Clip) => void;
	broadcastClipUpdated: (trackId: string, clipId: string, updates: Partial<Clip>) => void;
	broadcastClipRemoved: (trackId: string, clipId: string) => void;
	sendTimelineSync: (timeline: TimelineData) => void;
}

const MatchWebSocketContext = createContext<MatchWebSocketContextValue | null>(null);

interface MatchWebSocketProviderProps {
	children: React.ReactNode;
	matchId: string;
	userId: string;
	username: string;
	onRemoteMediaUploaded?: (media: MediaData) => void;
	onRemoteClipAdded?: (trackId: string, clip: ClipData, addedBy: { userId: string; username: string }) => void;
	onRemoteClipUpdated?: (
		trackId: string,
		clipId: string,
		updates: Partial<ClipData>,
		updatedBy: { userId: string; username: string }
	) => void;
	onRemoteClipRemoved?: (trackId: string, clipId: string, removedBy: { userId: string; username: string }) => void;
	onPlayerJoined?: (player: { userId: string; username: string }) => void;
	onPlayerLeft?: (userId: string) => void;
	onConnectionFailed?: () => void;
	onMatchStatusChange?: (status: string) => void;
	onTimelineSyncRequested?: () => TimelineData | null;
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

function clipDataFromProto(clip: ClipDataProto): ClipData {
	return {
		id: clip.id,
		type: mediaTypeToString(clip.type),
		name: clip.name,
		src: clip.src,
		startTime: clip.startTime,
		duration: clip.duration,
		sourceIn: clip.sourceIn,
		sourceDuration: clip.sourceDuration,
		thumbnail: clip.thumbnail,
		properties: clip.properties
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
					volume: clip.properties.volume,
					cropTop: clip.properties.cropTop,
					cropBottom: clip.properties.cropBottom,
					cropLeft: clip.properties.cropLeft,
					cropRight: clip.properties.cropRight,
			  }
			: {},
	};
}

export function MatchWS({
	children,
	matchId,
	userId,
	username,
	onRemoteMediaUploaded,
	onRemoteClipAdded,
	onRemoteClipUpdated,
	onRemoteClipRemoved,
	onPlayerJoined,
	onPlayerLeft,
	onConnectionFailed,
	onMatchStatusChange,
	onTimelineSyncRequested,
}: MatchWebSocketProviderProps) {
	const [status, setStatus] = useState<ConnectionStatus>("disconnected");
	const [playersOnline, setPlayersOnline] = useState(0);
	const hasReceivedInitialCount = useRef(false);

	const callbacksRef = useRef({
		onRemoteMediaUploaded,
		onRemoteClipAdded,
		onRemoteClipUpdated,
		onRemoteClipRemoved,
		onPlayerJoined,
		onPlayerLeft,
		onConnectionFailed,
		onMatchStatusChange,
		onTimelineSyncRequested,
	});
	callbacksRef.current = {
		onRemoteMediaUploaded,
		onRemoteClipAdded,
		onRemoteClipUpdated,
		onRemoteClipRemoved,
		onPlayerJoined,
		onPlayerLeft,
		onConnectionFailed,
		onMatchStatusChange,
		onTimelineSyncRequested,
	};

	const propsRef = useRef({ matchId, userId, username });
	propsRef.current = { matchId, userId, username };

	useEffect(() => {
		setPlayersOnline(0);
		hasReceivedInitialCount.current = false;
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
					mediaStore.addRemoteItem(media.id, media.name, mediaTypeToString(media.type), media.url);
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
				callbacksRef.current.onPlayerLeft?.(leftUserId);
				return;
			}

			if (isMatchStatusMessage(message) && message.payload.case === "matchStatus") {
				callbacksRef.current.onMatchStatusChange?.(message.payload.value.status);
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
		};

		const handleStatus = (newStatus: ConnectionStatus) => {
			setStatus(newStatus);
			if (newStatus === "failed") {
				callbacksRef.current.onConnectionFailed?.();
			}
		};

		const unsubscribe = subscribeToMatch(matchId, userId, username, handleMessage, handleStatus);

		return unsubscribe;
	}, [matchId, userId, username]);

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

	const broadcastClipAdded = useCallback((trackId: string, clip: Clip) => {
		const { matchId, userId, username } = propsRef.current;
		const clipData = createClipDataProto({
			id: clip.id,
			type: clip.type,
			name: clip.name,
			src: clip.src,
			startTime: clip.startTime,
			duration: clip.duration,
			sourceIn: clip.sourceIn,
			sourceDuration: clip.sourceDuration,
			properties: clip.properties as unknown as Record<string, unknown>,
		});
		sendMessage(matchId, userId, createClipAddedMessage(matchId, trackId, clipData, { userId, username }));
	}, []);

	const broadcastClipUpdated = useCallback((trackId: string, clipId: string, updates: Partial<Clip>) => {
		const { matchId, userId, username } = propsRef.current;
		const updateData = createClipDataProto({
			id: clipId,
			type: (updates.type as "video" | "audio" | "image") ?? "video",
			name: updates.name ?? "",
			src: updates.src ?? "",
			startTime: updates.startTime ?? 0,
			duration: updates.duration ?? 0,
			sourceIn: updates.sourceIn ?? 0,
			sourceDuration: updates.sourceDuration ?? 0,
			properties: updates.properties as unknown as Record<string, unknown>,
		});
		sendMessage(matchId, userId, createClipUpdatedMessage(matchId, trackId, clipId, updateData, { userId, username }));
	}, []);

	const broadcastClipRemoved = useCallback((trackId: string, clipId: string) => {
		const { matchId, userId, username } = propsRef.current;
		sendMessage(matchId, userId, createClipRemovedMessage(matchId, trackId, clipId, { userId, username }));
	}, []);

	const sendTimelineSync = useCallback((timeline: TimelineData) => {
		const { matchId, userId } = propsRef.current;
		sendMessage(matchId, userId, createTimelineSyncMessage(matchId, buildTimelineProto(timeline)));
	}, []);

	const value: MatchWebSocketContextValue = {
		status,
		playersOnline,
		matchId,
		broadcastMediaUploaded,
		broadcastMediaRemoved,
		broadcastClipAdded,
		broadcastClipUpdated,
		broadcastClipRemoved,
		sendTimelineSync,
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
