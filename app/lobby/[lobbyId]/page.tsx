"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/app/hooks/usePlayer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	UserGroupIcon,
	Copy01Icon,
	Tick01Icon,
	ArrowLeft01Icon,
	PlayIcon,
	CrownIcon,
	Logout01Icon,
	Video01Icon,
	Clock01Icon,
} from "@hugeicons/core-free-icons";
import { Lobby, LobbyPlayer } from "@/app/types/lobby";
import { MatchModifierBadges } from "@/app/components/MatchModifierBadges";
import { serializeMessage, createJoinLobbyMessage, createLeaveLobbyMessage } from "@/websocket/types";

export default function LobbyPage({ params }: { params: Promise<{ lobbyId: string }> }) {
	const { lobbyId } = use(params);
	const router = useRouter();
	const { playerId, username, isLoading: playerLoading, isAuthenticated } = usePlayer();

	const [lobby, setLobby] = useState<Lobby | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [isStarting, setIsStarting] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);
	const [showLeaveDialog, setShowLeaveDialog] = useState(false);
	const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

	const wsRef = useRef<WebSocket | null>(null);
	const joinedRef = useRef(false);

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

			if (data.status === "starting" || data.status === "in_match") {
				if (data.matchId) {
					router.push(`/match/${data.joinCode}`);
					return;
				}
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
		if (!lobby || !playerId || playerLoading || !isAuthenticated) return;

		const isInLobby = lobby.players.some((p) => p.id === playerId);
		if (!isInLobby) {
			fetch(`/api/lobbies/${lobbyId}/join`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
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
	}, [lobby, playerId, playerLoading, isAuthenticated, lobbyId, fetchLobby]);

	useEffect(() => {
		if (!playerId || !username || playerLoading || !isAuthenticated || joinedRef.current) return;

		const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
		if (!wsUrl) return;

		const ws = new WebSocket(wsUrl);
		ws.binaryType = "arraybuffer";
		wsRef.current = ws;

		ws.onopen = () => {
			ws.send(serializeMessage(createJoinLobbyMessage(lobbyId, playerId, username)));
			joinedRef.current = true;
			console.log(`[WS] Joined lobby ${lobbyId} for presence tracking`);
		};

		ws.onerror = () => {
			console.warn("[WS] Lobby presence WebSocket error (connection may have failed)");
		};

		return () => {
			if (wsRef.current) {
				if (wsRef.current.readyState === WebSocket.OPEN) {
					wsRef.current.send(serializeMessage(createLeaveLobbyMessage(lobbyId, playerId)));
					wsRef.current.close();
				} else if (wsRef.current.readyState === WebSocket.CONNECTING) {
					const ws = wsRef.current;
					const timeoutId = setTimeout(() => {
						ws.close();
					}, 5000);
					const handleConnectedLeave = () => {
						clearTimeout(timeoutId);
						ws.send(serializeMessage(createLeaveLobbyMessage(lobbyId, playerId)));
						ws.close();
					};
					const handleError = () => {
						clearTimeout(timeoutId);
						ws.close();
					};
					ws.addEventListener("open", handleConnectedLeave, { once: true });
					ws.addEventListener("error", handleError, { once: true });
				} else {
					wsRef.current.close();
				}
			}
			wsRef.current = null;
			joinedRef.current = false;
		};
	}, [lobbyId, playerId, username, playerLoading, isAuthenticated]);

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
			router.push(`/match/${data.joinCode}`);
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
			setShowLeaveDialog(false);
			await fetch(`/api/lobbies/${lobbyId}/leave`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			router.push(pendingNavigation || "/");
		} catch {
			router.push(pendingNavigation || "/");
		} finally {
			setPendingNavigation(null);
		}
	};

	const handleBackClick = () => {
		setPendingNavigation("/");
		setShowLeaveDialog(true);
	};

	const handleCancelLeave = () => {
		setShowLeaveDialog(false);
		setPendingNavigation(null);
	};

	const isHost = lobby?.hostPlayerId === playerId;
	const canStart = isHost && lobby && lobby.players.length >= 2;

	if (playerLoading || isLoading) {
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
			<Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>You're about to leave the lobby</DialogTitle>
						<DialogDescription>Are you sure?</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={handleCancelLeave}>
							Nevermind
						</Button>
						<Button variant="destructive" onClick={handleLeaveLobby} disabled={isLeaving}>
							{isLeaving ? "..." : "Yes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<header className="border-b bg-card">
				<div className="container mx-auto px-4 py-4 flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button variant="ghost" size="icon" onClick={handleBackClick}>
							<HugeiconsIcon icon={ArrowLeft01Icon} className="w-5 h-5" />
						</Button>
						<div className="flex items-center gap-3">
							<img src="/editmash.svg" alt="EditMash Logo" className="w-6 h-6" />
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
											<HugeiconsIcon icon={UserGroupIcon} className="w-5 h-5" />
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
												<HugeiconsIcon icon={UserGroupIcon} className="w-12 h-12 mx-auto mb-4 opacity-50" />
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
								{copied ? <HugeiconsIcon icon={Tick01Icon} className="w-5 h-5" /> : <HugeiconsIcon icon={Copy01Icon} className="w-5 h-5" />}
								<span className="font-mono text-base">{lobby.joinCode}</span>
							</Button>

							<Button
								variant="outline"
								size="lg"
								className="w-full gap-2 text-destructive-foreground"
								onClick={() => setShowLeaveDialog(true)}
								disabled={isLeaving}
							>
								<HugeiconsIcon icon={Logout01Icon} className="w-5 h-5" />
								{isLeaving ? "Leaving..." : "Leave"}
							</Button>

							{isHost ? (
								<Button size="lg" className="w-full gap-2" onClick={handleStartMatch} disabled={!canStart || isStarting}>
									<HugeiconsIcon icon={PlayIcon} className="w-5 h-5" />
									{isStarting ? "Starting..." : "Start"}
								</Button>
							) : (
								<Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50">
									<HugeiconsIcon icon={Clock01Icon} className="text-amber-600 dark:text-amber-400" />
									<AlertDescription className="text-amber-900 dark:text-amber-100">Waiting for host to start the match...</AlertDescription>
								</Alert>
							)}
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
				<AvatarImage src={player.image || undefined} alt={player.username} />
				<AvatarFallback className="text-xs">{player.username.slice(0, 2).toUpperCase()}</AvatarFallback>
			</Avatar>

			<div className="w-full text-center">
				<div className="flex items-center justify-center gap-1">
					{isHost && <HugeiconsIcon icon={CrownIcon} className="w-3 h-3 text-amber-600 shrink-0" />}
					<span className="text-xs font-medium truncate">{player.username}</span>
				</div>
			</div>
		</div>
	);
}
