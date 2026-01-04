"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Video01Icon,
	UserGroupIcon,
	Clock01Icon,
	Download01Icon,
	Home01Icon,
	Loading03Icon,
	CheckmarkCircle01Icon,
	CancelCircleIcon,
	ArrowLeft01Icon,
} from "@hugeicons/core-free-icons";
import { Match } from "@/app/types/match";

interface MatchResponse {
	match: Match;
	queuePosition: number | null;
	renderProgress: number | null;
}

export default function ResultsPage({ params }: { params: Promise<{ matchId: string }> }) {
	const { matchId } = use(params);
	const router = useRouter();

	const [match, setMatch] = useState<Match | null>(null);
	const [queuePosition, setQueuePosition] = useState<number | null>(null);
	const [renderProgress, setRenderProgress] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchMatch = useCallback(async () => {
		try {
			const response = await fetch(`/api/matches/${matchId}?results=true`);
			if (!response.ok) {
				if (response.status === 404) {
					setError("Match not found");
					return;
				}
				throw new Error("Failed to fetch match");
			}
			const data: MatchResponse = await response.json();
			setMatch(data.match);
			setQueuePosition(data.queuePosition);
			setRenderProgress(data.renderProgress);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load match");
		} finally {
			setIsLoading(false);
		}
	}, [matchId]);

	useEffect(() => {
		fetchMatch();
		const interval = setInterval(() => {
			fetchMatch();
		}, 3000);
		return () => clearInterval(interval);
	}, [fetchMatch]);

	if (isLoading) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Loading results...</div>
			</div>
		);
	}

	if (error || !match) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<Card className="max-w-md w-full mx-4">
					<CardHeader>
						<CardTitle className="text-destructive">Error</CardTitle>
						<CardDescription>{error || "Match not found"}</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={() => router.push("/")} className="w-full">
							Home
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			<header className="border-b bg-card">
				<div className="container mx-auto px-4 py-4 flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button variant="ghost" size="icon" onClick={() => router.push("/")}>
							<HugeiconsIcon icon={ArrowLeft01Icon} className="w-5 h-5" />
						</Button>
						<div className="flex items-center gap-3">
							<img src="/editmash.svg" alt="EditMash Logo" className="w-6 h-6" />
							<h1 className="text-xl font-bold">{match.lobbyName}</h1>
						</div>
					</div>
				</div>
			</header>

			<main className="container mx-auto px-4 py-6">
				<div className="grid lg:grid-cols-3 gap-6">
					<div className="lg:col-span-2">
						<Card>
							<CardHeader className="pb-3">
								<CardTitle>Results</CardTitle>
							</CardHeader>
							<CardContent>
								<RenderStatus match={match} queuePosition={queuePosition} renderProgress={renderProgress} />
							</CardContent>
						</Card>
					</div>

					<div className="space-y-4">
						<Card>
							<CardHeader className="pb-3">
								<CardTitle>Stats</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2.5">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2 text-muted-foreground">
										<HugeiconsIcon icon={UserGroupIcon} className="w-3.5 h-3.5" />
										<span className="text-xs">Players</span>
									</div>
									<span className="text-sm font-medium">{match.players.length}</span>
								</div>

								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2 text-muted-foreground">
										<HugeiconsIcon icon={Clock01Icon} className="w-3.5 h-3.5" />
										<span className="text-xs">Timeline</span>
									</div>
									<span className="text-sm font-medium">{match.config.timelineDuration}s</span>
								</div>

								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2 text-muted-foreground">
										<HugeiconsIcon icon={Video01Icon} className="w-3.5 h-3.5" />
										<span className="text-xs">Edits</span>
									</div>
									<span className="text-sm font-medium">{match.editCount || 0}</span>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-3">
								<CardTitle>Players ({match.players.length})</CardTitle>
							</CardHeader>
							<CardContent>
								<ScrollArea className="h-[200px] pr-3">
									<div className="grid grid-cols-3 gap-2">
										{match.players.map((player) => (
											<div key={player.id} className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/50">
												<Avatar className="w-8 h-8">
													<AvatarImage src={player.image || undefined} />
													<AvatarFallback className="text-xs">{player.username.slice(0, 2).toUpperCase()}</AvatarFallback>
												</Avatar>
												<span className="text-xs text-center truncate w-full">{player.username}</span>
											</div>
										))}
									</div>
								</ScrollArea>
							</CardContent>
						</Card>
					</div>
				</div>
			</main>
		</div>
	);
}

function RenderStatus({ match, queuePosition, renderProgress }: { match: Match; queuePosition: number | null; renderProgress: number | null }) {
	if (match.status === "rendering") {
		return (
			<div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-3">
				<HugeiconsIcon icon={Loading03Icon} className="w-10 h-10 animate-spin text-primary" />
				<div className="text-center">
					{queuePosition !== null ? (
						<>
							<p className="text-sm font-medium">Your position in the queue: {queuePosition}</p>
							<p className="text-xs text-muted-foreground">Waiting for an available slot...</p>
						</>
					) : (
						<>
							<p className="text-sm font-medium">Rendering your video... {renderProgress !== null ? `${Math.round(renderProgress)}%` : ""}</p>
							{renderProgress !== null && (
								<div className="w-48 h-1.5 bg-muted-foreground/20 rounded-full mt-2 overflow-hidden">
									<div
										className="h-full bg-primary rounded-full transition-all duration-300"
										style={{ width: `${renderProgress}%` }}
									/>
								</div>
							)}
							<p className="text-xs text-muted-foreground mt-1">This may take a few minutes</p>
						</>
					)}
				</div>
			</div>
		);
	}

	if (match.status === "failed") {
		return (
			<div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-3">
				<HugeiconsIcon icon={CancelCircleIcon} className="w-10 h-10 text-destructive" />
				<div className="text-center">
					<p className="text-sm font-medium text-destructive">Render failed</p>
					<p className="text-xs text-muted-foreground">{match.renderError || "An unexpected error occurred"}</p>
				</div>
			</div>
		);
	}

	if (match.status === "completed" && match.renderUrl) {
		return (
			<div className="aspect-video bg-black rounded-lg overflow-hidden">
				<video src={match.renderUrl} controls className="w-full h-full" />
			</div>
		);
	}

	return (
		<div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-3">
			<HugeiconsIcon icon={CheckmarkCircle01Icon} className="w-10 h-10 text-muted-foreground" />
			<p className="text-sm text-muted-foreground">Match complete</p>
		</div>
	);
}
