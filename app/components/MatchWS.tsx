"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { mediaStore, MediaItem } from "@/app/store/mediaStore";
import { subscribeToMatch, sendMessage } from "@/app/store/wsManager";
import type {
	WSMessage,
	MediaUploadedMessage,
	MediaRemovedMessage,
	PlayerJoinedMessage,
	PlayerLeftMessage,
	PlayerCountMessage,
	MatchStatusMessage,
} from "@/websocket/types";
import { createMessage } from "@/websocket/types";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "failed";

interface MatchWebSocketContextValue {
	status: ConnectionStatus;
	playersOnline: number;
	matchId: string;
	broadcastMediaUploaded: (media: MediaItem) => void;
	broadcastMediaRemoved: (mediaId: string) => void;
}

const MatchWebSocketContext = createContext<MatchWebSocketContextValue | null>(null);

interface MatchWebSocketProviderProps {
	children: React.ReactNode;
	matchId: string;
	userId: string;
	username: string;
	onRemoteMediaUploaded?: (media: MediaUploadedMessage["payload"]["media"]) => void;
	onPlayerJoined?: (player: { userId: string; username: string }) => void;
	onPlayerLeft?: (userId: string) => void;
	onConnectionFailed?: () => void;
	onMatchStatusChange?: (status: string) => void;
}

export function MatchWS({
	children,
	matchId,
	userId,
	username,
	onRemoteMediaUploaded,
	onPlayerJoined,
	onPlayerLeft,
	onConnectionFailed,
	onMatchStatusChange,
}: MatchWebSocketProviderProps) {
	const [status, setStatus] = useState<ConnectionStatus>("disconnected");
	const [playersOnline, setPlayersOnline] = useState(0);
	const hasReceivedInitialCount = useRef(false);

	const callbacksRef = useRef({ onRemoteMediaUploaded, onPlayerJoined, onPlayerLeft, onConnectionFailed, onMatchStatusChange });
	callbacksRef.current = { onRemoteMediaUploaded, onPlayerJoined, onPlayerLeft, onConnectionFailed, onMatchStatusChange };

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

			switch (message.type) {
				case "player_count": {
					const msg = message as PlayerCountMessage;
					hasReceivedInitialCount.current = true;
					setPlayersOnline(msg.payload.count);
					break;
				}
				case "media_uploaded": {
					const msg = message as MediaUploadedMessage;
					const { media } = msg.payload;
					if (media.uploadedBy.userId !== userId) {
						mediaStore.addRemoteItem(media.id, media.name, media.type, media.url);
						callbacksRef.current.onRemoteMediaUploaded?.(media);
					}
					break;
				}
				case "media_removed": {
					const msg = message as MediaRemovedMessage;
					if (msg.payload.removedBy !== userId) {
						mediaStore.removeItem(msg.payload.mediaId);
					}
					break;
				}
				case "player_joined": {
					const msg = message as PlayerJoinedMessage;
					setPlayersOnline((n) => n + 1);
					callbacksRef.current.onPlayerJoined?.(msg.payload.player);
					break;
				}
				case "player_left": {
					const msg = message as PlayerLeftMessage;
					setPlayersOnline((n) => Math.max(0, n - 1));
					callbacksRef.current.onPlayerLeft?.(msg.payload.userId);
					break;
				}
				case "match_status": {
					const msg = message as MatchStatusMessage;
					callbacksRef.current.onMatchStatusChange?.(msg.payload.status);
					break;
				}
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
			createMessage("media_uploaded", {
				matchId,
				media: {
					id: media.id,
					name: media.name,
					type: media.type,
					url: media.url,
					uploadedBy: { userId, username },
				},
			})
		);
	}, []);

	const broadcastMediaRemoved = useCallback((mediaId: string) => {
		const { matchId, userId } = propsRef.current;
		sendMessage(
			matchId,
			userId,
			createMessage("media_removed", {
				matchId,
				mediaId,
				removedBy: userId,
			})
		);
	}, []);

	const value: MatchWebSocketContextValue = {
		status,
		playersOnline,
		matchId,
		broadcastMediaUploaded,
		broadcastMediaRemoved,
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
