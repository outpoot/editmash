"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/app/hooks/usePlayer";
import TopBar from "@/app/components/TopBar";
import MainLayout, { MainLayoutRef } from "@/app/components/MainLayout";
import { MatchWS, useMatchWebSocketOptional } from "@/app/components/MatchWS";
import { TimelineState } from "@/app/types/timeline";
import { Match, MatchStatus, DEFAULT_MATCH_CONFIG } from "@/app/types/match";
import { mediaStore } from "@/app/store/mediaStore";
import { HugeiconsIcon } from "@hugeicons/react";
import { WifiOff02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

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
	const [serverTimeRemaining, setServerTimeRemaining] = useState<number | null>(null);
	const [localTimeRemaining, setLocalTimeRemaining] = useState<number | null>(null);
	const [timelineLoaded, setTimelineLoaded] = useState(false);

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

			if (matchData.match.timeline && mainLayoutRef.current) {
				mainLayoutRef.current.loadTimeline(matchData.match.timeline);
				setTimelineLoaded(true);
			}

			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load match");
		} finally {
			setIsLoading(false);
		}
	}, [matchId, router]);

	const loadMatchMedia = useCallback(async () => {
		try {
			const response = await fetch(`/api/matches/${matchId}/media`);
			if (response.ok) {
				const data = await response.json();
				for (const media of data.media) {
					if (!mediaStore.getItemById(media.id)) {
						mediaStore.addRemoteItem(media.id, media.name, media.type, media.url);
					}
				}
			}
		} catch (error) {
			console.error("Error loading match media:", error);
		}
	}, [matchId]);

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
		loadMatchMedia();
	}, [fetchMatch, loadMatchMedia]);

	useEffect(() => {
		fetchStatus();
		const interval = setInterval(fetchStatus, 5000);
		return () => clearInterval(interval);
	}, [fetchStatus]);

	const syncTimelineToServer = useCallback(async (_timeline: TimelineState) => {}, []);

	const handleTimelineStateChange = useCallback(
		(timeline: TimelineState | null) => {
			if (timeline && timelineLoaded) {
				syncTimelineToServer(timeline);
			}
		},
		[syncTimelineToServer, timelineLoaded]
	);

	const handleRemoteMediaUploaded = useCallback((media: { name: string; uploadedBy: { username: string } }) => {
		toast.info(`${media.uploadedBy.username} uploaded ${media.name}`);
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

	const handleMatchStatusChange = useCallback((status: string) => {
		console.log(`[Match] Status changed to: ${status}`);
		if (status === "rendering" || status === "completed" || status === "completing" || status === "failed") {
			router.push(`/results/${matchId}`);
		}
	}, [matchId, router]);

	if (playerLoading || isLoading || !stablePlayerRef.current) {
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
			onRemoteMediaUploaded={handleRemoteMediaUploaded}
			onPlayerJoined={handlePlayerJoined}
			onPlayerLeft={handlePlayerLeft}
			onConnectionFailed={handleConnectionFailed}
			onMatchStatusChange={handleMatchStatusChange}
		>
			<MatchContent
				showEffects={showEffects}
				setShowEffects={setShowEffects}
				localTimeRemaining={localTimeRemaining}
				mainLayoutRef={mainLayoutRef}
				onTimelineStateChange={handleTimelineStateChange}
				maxClipsPerUser={maxClipsPerUser}
			/>
		</MatchWS>
	);
}

interface MatchContentProps {
	showEffects: boolean;
	setShowEffects: (show: boolean) => void;
	localTimeRemaining: number | null;
	mainLayoutRef: React.RefObject<MainLayoutRef | null>;
	onTimelineStateChange: (timeline: TimelineState | null) => void;
	maxClipsPerUser: number;
}

function MatchContent({
	showEffects,
	setShowEffects,
	localTimeRemaining,
	mainLayoutRef,
	onTimelineStateChange,
	maxClipsPerUser,
}: MatchContentProps) {
	const ws = useMatchWebSocketOptional();
	const isDisconnected = ws?.status === "disconnected" || ws?.status === "connecting";
	const isFailed = ws?.status === "failed";

	return (
		<div className="h-screen flex flex-col relative">
			<TopBar
				showEffects={showEffects}
				onToggleEffects={() => setShowEffects(!showEffects)}
				onRender={() => {
					alert("Match will render automatically when time expires!");
				}}
				timeRemaining={localTimeRemaining}
				playersOnline={ws?.playersOnline}
			/>
			<MainLayout
				ref={mainLayoutRef}
				showEffects={showEffects}
				onTimelineStateChange={onTimelineStateChange}
				maxClipsPerUser={maxClipsPerUser}
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
