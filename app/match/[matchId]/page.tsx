"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/app/hooks/usePlayer";
import TopBar from "@/app/components/TopBar";
import MainLayout, { MainLayoutRef } from "@/app/components/MainLayout";
import { MatchWS, useMatchWebSocketOptional, flatPropertiesToNested } from "@/app/components/MatchWS";
import { TimelineState, Clip, VideoClip, AudioClip, ImageClip, Track } from "@/app/types/timeline";
import { Match, MatchStatus, DEFAULT_MATCH_CONFIG } from "@/app/types/match";
import { mediaStore } from "@/app/store/mediaStore";
import { HugeiconsIcon } from "@hugeicons/react";
import { WifiOff02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { ClipData, TimelineData } from "@/websocket/types";
import { VideoClipProperties, AudioClipProperties } from "@/app/types/timeline";

function transformTimelineFromApi(timeline: TimelineState): TimelineState {
	return {
		...timeline,
		tracks: timeline.tracks.map((track) => ({
			...track,
			clips: track.clips.map((clip) => {
				const props = clip.properties as unknown as Record<string, unknown>;
				const isAlreadyNested = props && props.position !== null && typeof props.position === "object";

				if (isAlreadyNested) {
					return clip;
				}

				const nestedProps = flatPropertiesToNested(props, clip.type);

				if (clip.type === "audio") {
					return {
						...clip,
						properties: nestedProps as unknown as AudioClipProperties,
					};
				}

				return {
					...clip,
					properties: nestedProps as unknown as VideoClipProperties,
				};
			}),
		})) as Track[],
	};
}

interface MatchResponse {
	match: Match;
}

interface MatchStatusResponse {
	status: MatchStatus;
	timeRemaining: number | null;
	matchId: string;
}

export default function MatchPage({ params }: { params: Promise<{ matchId: string }> }) {
	const { matchId } = use(params);
	const router = useRouter();
	const { playerId, username, isLoading: playerLoading } = usePlayer();

	const stablePlayerRef = useRef<{ playerId: string; username: string } | null>(null);
	if (playerId && username && !stablePlayerRef.current) {
		stablePlayerRef.current = { playerId, username };
	}

	const [match, setMatch] = useState<Match | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [userImage, setUserImage] = useState<string | undefined>(undefined);
	const [highlightColor, setHighlightColor] = useState<string>("#3b82f6");
	const [profileLoaded, setProfileLoaded] = useState(false);
	const [serverTimeRemaining, setServerTimeRemaining] = useState<number | null>(null);
	const [localTimeRemaining, setLocalTimeRemaining] = useState<number | null>(null);

	const mainLayoutRef = useRef<MainLayoutRef>(null);
	const lastServerSyncRef = useRef<number>(Date.now());

	const [showEffects, setShowEffects] = useState(false);

	const fetchMatch = useCallback(async () => {
		try {
			const response = await fetch(`/api/matches/${matchId}`);

			if (!response.ok) {
				if (response.status === 404) {
					setError("Match not found");
					return;
				}
				throw new Error("Failed to fetch match");
			}

			const data = await response.json();

			if (data.redirect) {
				router.push(data.redirect);
				return;
			}

			const matchData = data as MatchResponse;

			if (matchData.match.status === "completed" || matchData.match.status === "rendering" || matchData.match.status === "failed") {
				router.push(`/results/${matchId}`);
				return;
			}

			setMatch(matchData.match);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load match");
		} finally {
			setIsLoading(false);
		}
	}, [matchId, router]);

	const loadMatchMedia = useCallback(async () => {
		if (!stablePlayerRef.current) return;
		const currentUserId = stablePlayerRef.current.playerId;

		try {
			const response = await fetch(`/api/matches/${matchId}/media`);
			if (response.ok) {
				const data = await response.json();
				for (const media of data.media) {
					if (!mediaStore.getItemById(media.id)) {
						const isOwn = media.uploadedBy === currentUserId;
						mediaStore.addRemoteItem(media.id, media.name, media.type, media.url, isOwn);
					}
				}
			}
		} catch (error) {
			console.error("Error loading match media:", error);
		}
	}, [matchId]);

	const fetchUserProfile = useCallback(async () => {
		if (!stablePlayerRef.current) return;

		try {
			const response = await fetch("/api/user");
			if (response.ok) {
				const data = await response.json();
				if (data.user) {
					setUserImage(data.user.image ?? undefined);
					setHighlightColor(data.user.highlightColor ?? "#3b82f6");
				}
			}
		} catch (error) {
			console.error("Error fetching user profile:", error);
		} finally {
			setProfileLoaded(true);
		}
	}, []);

	const fetchStatus = useCallback(async () => {
		try {
			const response = await fetch(`/api/matches/${matchId}/status`);
			if (response.ok) {
				const data: MatchStatusResponse = await response.json();
				setServerTimeRemaining(data.timeRemaining);
				lastServerSyncRef.current = Date.now();

				if (data.status === "completed" || data.status === "completing" || data.status === "rendering") {
					router.push(`/results/${matchId}`);
				}
			}
		} catch {}
	}, [matchId, router]);

	useEffect(() => {
		if (serverTimeRemaining === null) return;

		setLocalTimeRemaining(serverTimeRemaining);

		const interval = setInterval(() => {
			const elapsed = (Date.now() - lastServerSyncRef.current) / 1000;
			const newTime = Math.max(0, serverTimeRemaining - elapsed);
			setLocalTimeRemaining(newTime);
		}, 100);

		return () => clearInterval(interval);
	}, [serverTimeRemaining]);

	useEffect(() => {
		fetchMatch();
	}, [fetchMatch]);

	useEffect(() => {
		if (playerId) {
			loadMatchMedia();
			fetchUserProfile();
		}
	}, [playerId, loadMatchMedia, fetchUserProfile]);

	useEffect(() => {
		fetchStatus();
		const interval = setInterval(fetchStatus, 5000);
		return () => clearInterval(interval);
	}, [fetchStatus]);

	const handleRemoteMediaUploaded = useCallback((media: { name: string; uploadedBy: { username: string } }) => {
		toast.info(`${media.uploadedBy.username} uploaded ${media.name}`);
	}, []);

	const handleRemoteClipAdded = useCallback((trackId: string, clipData: ClipData, addedBy: { userId: string; username: string }) => {
		const clip: Clip =
			clipData.type === "video"
				? ({
						...clipData,
						type: "video",
						properties: clipData.properties as unknown as VideoClip["properties"],
				  } as VideoClip)
				: clipData.type === "image"
				? ({
						...clipData,
						type: "image",
						properties: clipData.properties as unknown as ImageClip["properties"],
				  } as ImageClip)
				: ({
						...clipData,
						type: "audio",
						properties: clipData.properties as unknown as AudioClip["properties"],
				  } as AudioClip);

		mainLayoutRef.current?.addRemoteClip(trackId, clip);
	}, []);

	const handleRemoteClipUpdated = useCallback(
		(trackId: string, clipId: string, updates: Partial<ClipData>, updatedBy: { userId: string; username: string }, oldTrackId?: string) => {
			if (oldTrackId && oldTrackId !== trackId) {
				mainLayoutRef.current?.moveRemoteClip(oldTrackId, trackId, clipId, updates as Partial<Clip>);
			} else {
				mainLayoutRef.current?.updateRemoteClip(trackId, clipId, updates as Partial<Clip>);
			}
		},
		[]
	);

	const handleRemoteClipRemoved = useCallback((trackId: string, clipId: string, removedBy: { userId: string; username: string }) => {
		mainLayoutRef.current?.removeRemoteClip(trackId, clipId);
	}, []);

	const handleRemoteClipSplit = useCallback(
		(trackId: string, originalClipData: ClipData, newClipData: ClipData, splitBy: { userId: string; username: string }) => {
			const convertClip = (clipData: ClipData): Clip => {
				if (clipData.type === "video") {
					return {
						...clipData,
						type: "video",
						properties: clipData.properties as unknown as VideoClip["properties"],
					} as VideoClip;
				} else if (clipData.type === "image") {
					return {
						...clipData,
						type: "image",
						properties: clipData.properties as unknown as ImageClip["properties"],
					} as ImageClip;
				} else {
					return {
						...clipData,
						type: "audio",
						properties: clipData.properties as unknown as AudioClip["properties"],
					} as AudioClip;
				}
			};

			const originalClip = convertClip(originalClipData);
			const newClip = convertClip(newClipData);

			mainLayoutRef.current?.splitRemoteClip(trackId, originalClip, newClip);
		},
		[]
	);

	const handleZoneClipsReceived = useCallback((startTime: number, endTime: number, clips: Array<{ trackId: string; clip: ClipData }>) => {
		const convertedClips: Array<{ trackId: string; clip: Clip }> = clips.map(({ trackId, clip }) => {
			const convertedClip: Clip =
				clip.type === "video"
					? ({
							...clip,
							type: "video",
							properties: clip.properties as unknown as VideoClip["properties"],
					  } as VideoClip)
					: clip.type === "image"
					? ({
							...clip,
							type: "image",
							properties: clip.properties as unknown as ImageClip["properties"],
					  } as ImageClip)
					: ({
							...clip,
							type: "audio",
							properties: clip.properties as unknown as AudioClip["properties"],
					  } as AudioClip);

			return { trackId, clip: convertedClip };
		});

		mainLayoutRef.current?.syncZoneClips(convertedClips);
	}, []);

	const handlePlayerJoined = useCallback((player: { username: string }) => {
		toast.info(`${player.username} joined the match`);
	}, []);

	const handlePlayerLeft = useCallback(() => {
		toast.info(`A player left the match`);
	}, []);

	const handleConnectionFailed = useCallback(() => {
		toast.error("Connection to server failed after multiple attempts");
	}, []);

	const handleMatchStatusChange = useCallback(
		(status: string) => {
			if (status === "rendering" || status === "completed" || status === "completing" || status === "failed") {
				router.push(`/results/${matchId}`);
			}
		},
		[matchId, router]
	);

	const handleTimelineSyncRequested = useCallback((): TimelineData | null => {
		const timelineState = mainLayoutRef.current?.getTimelineState();
		if (!timelineState) return null;

		return {
			duration: timelineState.duration,
			tracks: timelineState.tracks.map((track) => ({
				id: track.id,
				type: track.type,
				clips: track.clips.map((clip) => ({
					id: clip.id,
					type: clip.type,
					name: clip.name,
					src: clip.src,
					startTime: clip.startTime,
					duration: clip.duration,
					sourceIn: clip.sourceIn,
					sourceDuration: clip.sourceDuration,
					// unknown since we have to strip thumbnail for sync, client will regenerate
					properties: clip.properties as unknown as Record<string, unknown>,
				})),
			})),
		};
	}, []);

	if (playerLoading || isLoading || !stablePlayerRef.current || !profileLoaded) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Loading match...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="text-center">
					<p className="text-destructive mb-4">{error}</p>
					<button onClick={() => router.push("/")} className="text-primary hover:underline">
						Back to Home
					</button>
				</div>
			</div>
		);
	}

	const maxClipsPerUser = match?.config?.maxClipsPerUser ?? DEFAULT_MATCH_CONFIG.maxClipsPerUser;

	return (
		<MatchWS
			matchId={matchId}
			userId={stablePlayerRef.current.playerId}
			username={stablePlayerRef.current.username}
			userImage={userImage}
			highlightColor={highlightColor}
			onRemoteMediaUploaded={handleRemoteMediaUploaded}
			onRemoteClipAdded={handleRemoteClipAdded}
			onRemoteClipUpdated={handleRemoteClipUpdated}
			onRemoteClipRemoved={handleRemoteClipRemoved}
			onRemoteClipSplit={handleRemoteClipSplit}
			onZoneClipsReceived={handleZoneClipsReceived}
			onPlayerJoined={handlePlayerJoined}
			onPlayerLeft={handlePlayerLeft}
			onConnectionFailed={handleConnectionFailed}
			onMatchStatusChange={handleMatchStatusChange}
			onTimelineSyncRequested={handleTimelineSyncRequested}
		>
			<MatchContent
				showEffects={showEffects}
				setShowEffects={setShowEffects}
				localTimeRemaining={localTimeRemaining}
				mainLayoutRef={mainLayoutRef}
				maxClipsPerUser={maxClipsPerUser}
				initialTimeline={match?.timeline ? transformTimelineFromApi(match.timeline) : undefined}
			/>
		</MatchWS>
	);
}

interface MatchContentProps {
	showEffects: boolean;
	setShowEffects: (show: boolean) => void;
	localTimeRemaining: number | null;
	mainLayoutRef: React.RefObject<MainLayoutRef | null>;
	maxClipsPerUser: number;
	initialTimeline?: TimelineState;
}

function MatchContent({
	showEffects,
	setShowEffects,
	localTimeRemaining,
	mainLayoutRef,
	maxClipsPerUser,
	initialTimeline,
}: MatchContentProps) {
	const ws = useMatchWebSocketOptional();
	const isDisconnected = ws?.status === "disconnected" || ws?.status === "connecting";
	const isFailed = ws?.status === "failed";

	const initialLoadDoneRef = useRef(false);
	const loadRetryCountRef = useRef(0);
	const MAX_LOAD_RETRIES = 5;

	const ZONE_SIZE = 5; // size of each zone
	const ZONE_PREFETCH = 1; // how early to start fetching next zone
	const lastZoneRef = useRef<{ startTime: number; endTime: number } | null>(null);

	const loadTimeline = useCallback(() => {
		if (initialLoadDoneRef.current) return;

		const totalClips = initialTimeline?.tracks?.reduce((acc, t) => acc + t.clips.length, 0) ?? 0;
		if (!initialTimeline || !initialTimeline.tracks || totalClips === 0) return;

		if (mainLayoutRef.current) {
			mainLayoutRef.current.loadTimeline(initialTimeline);
			initialLoadDoneRef.current = true;
			loadRetryCountRef.current = 0;
		} else if (loadRetryCountRef.current < MAX_LOAD_RETRIES) {
			const delay = 50 * Math.pow(2, loadRetryCountRef.current);
			loadRetryCountRef.current++;
			setTimeout(loadTimeline, delay);
		} else {
			toast.error("Failed to load timeline. Please refresh the page.");
		}
	}, [initialTimeline]);

	const mainLayoutCallbackRef = useCallback(
		(node: MainLayoutRef | null) => {
			(mainLayoutRef as React.MutableRefObject<MainLayoutRef | null>).current = node;
			if (node) {
				loadTimeline();
			}
		},
		[loadTimeline]
	);

	const handleClipAdded = useCallback(
		(trackId: string, clip: Clip) => {
			ws?.broadcastClipAdded(trackId, clip);
		},
		[ws]
	);

	const handleClipUpdated = useCallback(
		(trackId: string, clip: Clip) => {
			ws?.broadcastClipUpdated(trackId, clip);
		},
		[ws]
	);

	const handleClipRemoved = useCallback(
		(trackId: string, clipId: string) => {
			ws?.broadcastClipRemoved(trackId, clipId);
		},
		[ws]
	);

	const handleClipSplit = useCallback(
		(trackId: string, originalClip: Clip, newClip: Clip) => {
			ws?.broadcastClipSplit(trackId, originalClip, newClip);
		},
		[ws]
	);

	const handleSelectionChange = useCallback(
		(clips: Array<{ clipId: string; trackId: string }>) => {
			ws?.broadcastClipSelection(clips);
		},
		[ws]
	);

	const handleCurrentTimeChange = useCallback(
		(time: number) => {
			if (!ws?.subscribeToZone) return;

			const zoneIndex = Math.floor(time / ZONE_SIZE);
			const zoneStart = zoneIndex * ZONE_SIZE;
			const zoneEnd = zoneStart + ZONE_SIZE;

			const lastZone = lastZoneRef.current;
			const needsNewZone =
				!lastZone ||
				zoneStart !== lastZone.startTime || // different zone
				time >= lastZone.endTime - ZONE_PREFETCH; // approaching end of current zone

			if (needsNewZone) {
				const newZoneStart = zoneStart;
				const newZoneEnd = zoneEnd + ZONE_SIZE; // include next zone

				lastZoneRef.current = { startTime: newZoneStart, endTime: newZoneEnd };
				ws.subscribeToZone(newZoneStart, newZoneEnd);
			}
		},
		[ws]
	);

	useEffect(() => {
		if (ws?.status === "connected" && ws.subscribeToZone) {
			const initialZoneEnd = ZONE_SIZE * 2;
			lastZoneRef.current = { startTime: 0, endTime: initialZoneEnd };
			ws.subscribeToZone(0, initialZoneEnd);
		}
	}, [ws?.status, ws?.subscribeToZone]);

	return (
		<div className="h-screen flex flex-col relative">
			<TopBar
				showEffects={showEffects}
				onToggleEffects={() => setShowEffects(!showEffects)}
				timeRemaining={localTimeRemaining}
				playersOnline={ws?.playersOnline}
			/>
			<MainLayout
				ref={mainLayoutCallbackRef}
				showEffects={showEffects}
				maxClipsPerUser={maxClipsPerUser}
				onClipAdded={handleClipAdded}
				onClipUpdated={handleClipUpdated}
				onClipRemoved={handleClipRemoved}
				onClipSplit={handleClipSplit}
				onSelectionChange={handleSelectionChange}
				remoteSelections={ws?.remoteSelections}
				onCurrentTimeChange={handleCurrentTimeChange}
			/>

			{isFailed && (
				<div className="fixed inset-0 z-100 flex items-center justify-center bg-background/90 backdrop-blur-xl">
					<div className="flex flex-col items-center gap-4 text-center">
						<HugeiconsIcon icon={WifiOff02Icon} size={128} className="text-red-500" />
						<span className="text-lg font-semibold text-destructive">Connection Failed</span>
						<span className="text-sm text-muted-foreground max-w-xs">
							Unable to connect to the server after multiple attempts. Your changes may not sync with other players.
						</span>
						<button
							onClick={() => window.location.reload()}
							className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
						>
							Reload
						</button>
					</div>
				</div>
			)}

			{isDisconnected && !isFailed && (
				<div className="fixed inset-0 z-100 flex items-center justify-center bg-background/80 backdrop-blur-xl">
					<div className="flex flex-col items-center gap-3">
						<HugeiconsIcon icon={WifiOff02Icon} size={128} className="text-red-500 animate-pulse" />
						<span className="text-lg text-muted-foreground">{ws?.status === "connecting" ? "Connecting..." : "Reconnecting..."}</span>
					</div>
				</div>
			)}
		</div>
	);
}
