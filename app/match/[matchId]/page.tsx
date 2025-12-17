"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePlayerId } from "@/app/hooks/usePlayer";
import TopBar from "@/app/components/TopBar";
import MainLayout, { MainLayoutRef } from "@/app/components/MainLayout";
import { TimelineState } from "@/app/types/timeline";
import { Match, MatchStatus } from "@/app/types/match";

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
	const { playerId, isLoading: playerLoading } = usePlayerId();

	const [match, setMatch] = useState<Match | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [serverTimeRemaining, setServerTimeRemaining] = useState<number | null>(null);
	const [localTimeRemaining, setLocalTimeRemaining] = useState<number | null>(null);
	const [timelineLoaded, setTimelineLoaded] = useState(false);

	const mainLayoutRef = useRef<MainLayoutRef>(null);
	const lastServerSyncRef = useRef<number>(Date.now());

	const [showMedia, setShowMedia] = useState(true);
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
			const data: MatchResponse = await response.json();
			setMatch(data.match);

			if (data.match.timeline && mainLayoutRef.current) {
				mainLayoutRef.current.loadTimeline(data.match.timeline);
				setTimelineLoaded(true);
			}

			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load match");
		} finally {
			setIsLoading(false);
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
		} catch {

		}
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
		fetchStatus();
		const interval = setInterval(fetchStatus, 5000);
		return () => clearInterval(interval);
	}, [fetchStatus]);

	const syncTimelineToServer = useCallback(
		async (timeline: TimelineState) => {
			if (!playerId) return;

			try {
				await fetch(`/api/matches/${matchId}/timeline`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						playerId,
						timelineState: timeline,
					}),
				});
			} catch (err) {
				console.error("Failed to sync timeline:", err);
			}
		},
		[matchId, playerId]
	);

	const handleTimelineStateChange = useCallback(
		(timeline: TimelineState | null) => {
			if (timeline && timelineLoaded) {
				syncTimelineToServer(timeline);
			}
		},
		[syncTimelineToServer, timelineLoaded]
	);

	if (playerLoading || isLoading) {
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

	return (
		<div className="h-screen flex flex-col">
			<TopBar
				showMedia={showMedia}
				showEffects={showEffects}
				onToggleMedia={() => setShowMedia(!showMedia)}
				onToggleEffects={() => setShowEffects(!showEffects)}
				onRender={() => {
					alert("Match will render automatically when time expires!");
				}}
				onSaveTimeline={() => {
					alert("Match progress is saved automatically!");
				}}
				onImportTimeline={() => {
					alert("Import is disabled during matches.");
				}}
				timeRemaining={localTimeRemaining}
				matchInfo={match ? { playerCount: match.players.length } : undefined}
			/>
			<MainLayout ref={mainLayoutRef} showMedia={showMedia} showEffects={showEffects} onTimelineStateChange={handleTimelineStateChange} />
		</div>
	);
}
