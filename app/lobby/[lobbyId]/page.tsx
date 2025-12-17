"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { usePlayerId, useUsername } from "@/app/hooks/usePlayer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Copy, Check, ArrowLeft, Play, Crown, LogOut, Video, Clock } from "lucide-react";
import { Lobby, LobbyPlayer } from "@/app/types/lobby";
import { MatchModifierBadges } from "@/app/components/MatchModifierBadges";

export default function LobbyPage({ params }: { params: Promise<{ lobbyId: string }> }) {
	const { lobbyId } = use(params);
	const router = useRouter();
	const { playerId, isLoading: playerLoading } = usePlayerId();
	const { username, isLoading: usernameLoading } = useUsername();

	const [lobby, setLobby] = useState<Lobby | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [isStarting, setIsStarting] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);

	const fetchLobby = useCallback(async () => {
		try {
			const response = await fetch(`/api/lobbies/${lobbyId}`);
			if (!response.ok) {
				if (response.status === 404) {
					setError("Lobby not found");
					return;
				}
				throw new Error("Failed to fetch lobby");
			}
			const data: Lobby = await response.json();
			setLobby(data);

			if (data.status === "in_match" && data.matchId) {
				router.push(`/match/${data.matchId}`);
				return;
			}

			if (data.status === "closed") {
				router.push("/");
				return;
			}

			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load lobby");
		} finally {
			setIsLoading(false);
		}
	}, [lobbyId, router]);

	useEffect(() => {
		fetchLobby();
		const interval = setInterval(fetchLobby, 2000);
		return () => clearInterval(interval);
	}, [fetchLobby]);

	useEffect(() => {
		if (!lobby || !playerId || !username || playerLoading || usernameLoading) return;

		const isInLobby = lobby.players.some((p) => p.id === playerId);
		if (!isInLobby) {
			fetch(`/api/lobbies/${lobbyId}/join`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ playerId, username }),
			}).then((res) => {
				if (!res.ok) {
					res.json().then((data) => {
						setError(data.message || data.error || "Failed to join lobby");
					});
				} else {
					fetchLobby();
				}
			});
		}
	}, [lobby, playerId, username, playerLoading, usernameLoading, lobbyId, fetchLobby]);

	const copyCode = () => {
		if (!lobby) return;
		navigator.clipboard.writeText(lobby.joinCode);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleStartMatch = async () => {
		if (!lobby || !playerId) return;

		try {
			setIsStarting(true);
			const response = await fetch("/api/matches/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ lobbyId: lobby.id }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to start match");
			}

			const data = await response.json();
			router.push(`/match/${data.matchId}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to start match");
		} finally {
			setIsStarting(false);
		}
	};

	const handleLeaveLobby = async () => {
		if (!lobby || !playerId) return;

		try {
			setIsLeaving(true);
			await fetch(`/api/lobbies/${lobbyId}/leave`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ playerId }),
			});
			router.push("/");
		} catch {
			router.push("/");
		}
	};

	const isHost = lobby?.hostPlayerId === playerId;
	const canStart = isHost && lobby && lobby.players.length >= 1;

	if (playerLoading || usernameLoading || isLoading) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Loading lobby...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<Card className="max-w-md w-full mx-4">
					<CardHeader>
						<CardTitle className="text-destructive">Error</CardTitle>
						<CardDescription>{error}</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={() => router.push("/")} className="w-full">
							Back to Home
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!lobby) {
		return null;
	}

	return (
		<div className="min-h-screen bg-background">
			<header className="border-b bg-card">
				<div className="container mx-auto px-4 py-4 flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button variant="ghost" size="icon" onClick={() => router.push("/")}>
							<ArrowLeft className="w-5 h-5" />
						</Button>
						<div className="flex items-center gap-3">
							<Video className="w-6 h-6 text-primary" />
							<h1 className="text-xl font-bold">{lobby.name}</h1>
						</div>
					</div>
				</div>
			</header>

			<main className="container mx-auto px-4 py-8">
				<div className="grid lg:grid-cols-3 gap-8">
					<div className="lg:col-span-2">
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between">
									<div>
										<CardTitle className="flex items-center gap-2">
											<Users className="w-5 h-5" />
											Players
											<span className="text-muted-foreground text-xs">
												({lobby.players.length} / {lobby.matchConfig.maxPlayers})
											</span>
										</CardTitle>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<ScrollArea className="h-[400px] pr-4">
									<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
										{lobby.players.map((player) => (
											<PlayerCard
												key={player.id}
												player={player}
												isHost={player.id === lobby.hostPlayerId}
												isCurrentUser={player.id === playerId}
											/>
										))}

										{lobby.players.length === 0 && (
											<div className="col-span-full text-center py-8 text-muted-foreground">
												<Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
												<p>No players yet. Share the code to invite friends!</p>
											</div>
										)}
									</div>
								</ScrollArea>
							</CardContent>
						</Card>
					</div>

					<div className="space-y-4">
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Modifiers</CardTitle>
							</CardHeader>
							<CardContent>
								<MatchModifierBadges matchConfig={lobby.matchConfig} showMaxPlayers={true} />
							</CardContent>
						</Card>

						<div className="space-y-3">
							<Button variant="outline" size="lg" className="w-full gap-2" onClick={copyCode}>
								{copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
								<span className="font-mono text-base">{lobby.joinCode}</span>
							</Button>

							{isHost ? (
								<Button size="lg" className="w-full gap-2" onClick={handleStartMatch} disabled={!canStart || isStarting}>
									<Play className="w-5 h-5" />
									{isStarting ? "Starting..." : "Start"}
								</Button>
							) : (
								<Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50">
									<Clock className="text-amber-600 dark:text-amber-400" />
									<AlertDescription className="text-amber-900 dark:text-amber-100">Waiting for host to start the match...</AlertDescription>
								</Alert>
							)}

							<Button
								variant="outline"
								size="lg"
								className="w-full gap-2 text-destructive-foreground"
								onClick={handleLeaveLobby}
								disabled={isLeaving}
							>
								<LogOut className="w-5 h-5" />
								{isLeaving ? "Leaving..." : "Leave"}
							</Button>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}

function PlayerCard({ player, isHost, isCurrentUser }: { player: LobbyPlayer; isHost: boolean; isCurrentUser: boolean }) {
	return (
		<div
			className={`flex flex-col items-center gap-1.5 p-2 rounded-lg ${
				isCurrentUser ? "bg-primary/10 border border-primary/20" : "bg-muted/50"
			}`}
		>
			<Avatar className="w-8 h-8">
				<AvatarFallback className="text-xs">{player.username.slice(0, 2).toUpperCase()}</AvatarFallback>
			</Avatar>

			<div className="w-full text-center">
				<div className="flex items-center justify-center gap-1">
					{isHost && <Crown className="w-3 h-3 text-amber-600 flex-shrink-0" />}
					<span className="text-xs font-medium truncate">{player.username}</span>
				</div>
			</div>
		</div>
	);
}
