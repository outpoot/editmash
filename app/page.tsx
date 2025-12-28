"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePlayer } from "./hooks/usePlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserGroupIcon, Add01Icon, Copy01Icon, Tick01Icon, QrCode01Icon, LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { LobbyListItemWithConfig, LobbyStatus } from "./types/lobby";
import { MatchConfig, DEFAULT_MATCH_CONFIG } from "./types/match";
import { MatchModifierBadges } from "./components/MatchModifierBadges";
import { UserMenu } from "./components/UserMenu";
import {
	type WSMessage,
	MessageType,
	isLobbiesUpdateMessage,
	serializeMessage,
	deserializeMessage,
	createSubscribeLobbiesMessage,
} from "@/websocket/types";

export default function MatchmakingPage() {
	const router = useRouter();
	const { playerId, username, isLoading: playerLoading, isAuthenticated, activeMatch } = usePlayer();

	const [lobbies, setLobbies] = useState<LobbyListItemWithConfig[]>([]);

	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [lobbyName, setLobbyName] = useState("");
	const [matchConfig, setMatchConfig] = useState<MatchConfig>(DEFAULT_MATCH_CONFIG);
	const [isCreating, setIsCreating] = useState(false);

	const [lobbyPlaceholder] = useState(() => {
		const placeholders = [
			"iShowSprint edit",
			"MrBeat edit",
			"CarpetScam ad",
			"Ohnedot edit",
			"CaseWoah edit",
			"Jnyxzy edit",
			"thugger type beat",
			"Nitefort montage",
			"TokTik compilation",
			"MePresent video",
			"facial development tips",
			"ken carson i love you",
		];
		return placeholders[Math.floor(Math.random() * placeholders.length)];
	});

	const [showJoinDialog, setShowJoinDialog] = useState(false);
	const [joinCode, setJoinCode] = useState("");
	const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
	const [showActiveMatchDialog, setShowActiveMatchDialog] = useState(false);

	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mountedRef = useRef(true);

	const connectWebSocket = useCallback(() => {
		const url = process.env.NEXT_PUBLIC_WS_URL;
		if (!url || !mountedRef.current) return;

		if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
			return;
		}

		const ws = new WebSocket(url);
		ws.binaryType = "arraybuffer";
		wsRef.current = ws;

		ws.onopen = () => {
			if (!mountedRef.current) {
				ws.close();
				return;
			}
			ws.send(serializeMessage(createSubscribeLobbiesMessage()));
		};

		ws.onmessage = (event) => {
			try {
				const message = deserializeMessage(event.data);
				if (isLobbiesUpdateMessage(message) && message.payload.case === "lobbiesUpdate") {
					const lobbies = message.payload.value.lobbies;
					setLobbies(
						lobbies.map((l) => ({
							id: l.id,
							name: l.name,
							joinCode: l.joinCode,
							hostUsername: l.hostUsername,
							playerCount: l.playerCount,
							maxPlayers: l.maxPlayers,
							status: l.status as LobbyStatus,
							isSystemLobby: l.isSystemLobby ?? false,
							createdAt: new Date(l.createdAt),
							matchConfig: l.matchConfig ? {
								timelineDuration: l.matchConfig.timelineDuration,
								matchDuration: l.matchConfig.matchDuration,
								maxPlayers: l.matchConfig.maxPlayers,
								audioMaxDb: l.matchConfig.audioMaxDb,
								clipSizeMin: l.matchConfig.clipSizeMin,
								clipSizeMax: l.matchConfig.clipSizeMax,
								maxVideoTracks: l.matchConfig.maxVideoTracks,
								maxAudioTracks: l.matchConfig.maxAudioTracks,
								maxClipsPerUser: l.matchConfig.maxClipsPerUser,
								constraints: l.matchConfig.constraints,
							} : DEFAULT_MATCH_CONFIG,
							players: l.players?.map((p) => ({
								id: p.id,
								username: p.username,
								image: p.image,
							})) ?? [],
							matchEndsAt: l.matchEndsAt ? new Date(l.matchEndsAt) : null,
						}))
					);
				}
			} catch (e) {
				console.error("[WS] Parse error:", e);
			}
		};

		ws.onclose = () => {
			if (!mountedRef.current) return;
			wsRef.current = null;
			reconnectTimeoutRef.current = setTimeout(() => {
				if (mountedRef.current) {
					connectWebSocket();
				}
			}, 2000);
		};

		ws.onerror = () => {
			// silently ignore because onclose will handle reconnect
		};
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		connectWebSocket();

		return () => {
			mountedRef.current = false;
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [connectWebSocket]);

	const handleCreateLobby = async () => {
		if (!isAuthenticated || !lobbyName.trim()) return;

		try {
			setIsCreating(true);
			const response = await fetch("/api/lobbies", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: lobbyName.trim(),
					matchConfig,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to create lobby");
			}

			const data = await response.json();
			router.push(`/lobby/${data.lobbyId}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to create lobby");
		} finally {
			setIsCreating(false);
		}
	};

	const handleJoinLobby = async (lobbyId: string) => {
		if (!isAuthenticated) {
			toast.error("Please sign in to join a lobby");
			return;
		}

		if (activeMatch) {
			setShowActiveMatchDialog(true);
			return;
		}

		try {
			setJoiningLobbyId(lobbyId);
			const response = await fetch(`/api/lobbies/${lobbyId}/join`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			if (!response.ok) {
				const data = await response.json();
				const errorMessage = data.message || data.error || "Failed to join lobby";

				// If already in lobby, just redirect instead of showing error
				if (errorMessage === "Player already in lobby") {
					router.push(`/lobby/${lobbyId}`);
					return;
				}

				throw new Error(errorMessage);
			}

			router.push(`/lobby/${lobbyId}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to join lobby");
		} finally {
			setJoiningLobbyId(null);
		}
	};

	const handleJoinByCode = async () => {
		if (!joinCode.trim()) return;
		await handleJoinLobby(joinCode.trim().toUpperCase());
		setShowJoinDialog(false);
	};

	if (playerLoading) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			<header className="border-b bg-card">
				<div className="container mx-auto px-4 py-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<img src="/editmash.svg" alt="EditMash Logo" className="w-6 h-6" />
						<h1 className="text-xl font-extrabold">EditMash</h1>
					</div>

					<UserMenu />
				</div>
			</header>

			<main className="container mx-auto px-4 py-8">
				<div className="flex flex-wrap gap-4 mb-8">
					<Dialog
						open={showCreateDialog}
						onOpenChange={(open) => {
							if (open && !isAuthenticated) {
								toast.error("Please sign in to create a lobby");
								return;
							}
							setShowCreateDialog(open);
						}}
					>
						<DialogTrigger asChild>
							<Button size="lg" className="gap-2">
								<HugeiconsIcon icon={Add01Icon} className="w-5 h-5" />
								Create
							</Button>
						</DialogTrigger>
						<DialogContent className="max-w-md">
							<DialogHeader>
								<DialogTitle>Create Lobby</DialogTitle>
								<DialogDescription>Set up a new match with your modifiers.</DialogDescription>
							</DialogHeader>

							<div className="space-y-4 py-4">
								<div className="space-y-2">
									<Label htmlFor="lobby-name">Name</Label>
									<Input id="lobby-name" placeholder={lobbyPlaceholder} value={lobbyName} onChange={(e) => setLobbyName(e.target.value)} />
								</div>

								<Separator />

								<div className="space-y-4">
									<div className="space-y-2">
										<Label>Timeline</Label>
										<div className="flex gap-2">
											{[5, 15, 30, 60].map((sec) => (
												<Button
													key={sec}
													type="button"
													variant={matchConfig.timelineDuration === sec ? "default" : "outline"}
													size="sm"
													className="flex-1"
													onClick={() => setMatchConfig({ ...matchConfig, timelineDuration: sec })}
												>
													{sec}s
												</Button>
											))}
										</div>
									</div>

									<div className="space-y-2">
										<div className="flex justify-between">
											<Label>Duration</Label>
											<span className="text-sm text-muted-foreground">{matchConfig.matchDuration} min</span>
										</div>
										<Slider
											value={[matchConfig.matchDuration]}
											onValueChange={([v]) => setMatchConfig({ ...matchConfig, matchDuration: v })}
											min={1}
											max={10}
											step={1}
										/>
									</div>

									<div className="space-y-2">
										<div className="flex justify-between">
											<Label>Capacity</Label>
											<span className="text-sm text-muted-foreground">{matchConfig.maxPlayers} players</span>
										</div>
										<Slider
											value={[matchConfig.maxPlayers]}
											onValueChange={([v]) => setMatchConfig({ ...matchConfig, maxPlayers: v })}
											min={2}
											max={500}
											step={1}
										/>
									</div>

									<div className="space-y-2">
										<div className="flex justify-between">
											<Label>Max Volume</Label>
											<span className="text-sm text-muted-foreground">
												{matchConfig.audioMaxDb > 0 ? "+" : ""}
												{matchConfig.audioMaxDb} dB
											</span>
										</div>
										<Slider
											value={[matchConfig.audioMaxDb]}
											onValueChange={([v]) => setMatchConfig({ ...matchConfig, audioMaxDb: v })}
											min={-12}
											max={12}
											step={1}
										/>
									</div>

									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label>Min Clip Duration</Label>
											<div className="flex items-center gap-2">
												<Slider
													value={[matchConfig.clipSizeMin]}
													onValueChange={([v]) => setMatchConfig({ ...matchConfig, clipSizeMin: v })}
													min={0.1}
													max={5}
													step={0.1}
													className="flex-1"
												/>
												<span className="text-xs text-muted-foreground w-8">{matchConfig.clipSizeMin}s</span>
											</div>
										</div>
										<div className="space-y-2">
											<Label>Max Clip Duration</Label>
											<div className="flex items-center gap-2">
												<Slider
													value={[matchConfig.clipSizeMax]}
													onValueChange={([v]) => setMatchConfig({ ...matchConfig, clipSizeMax: v })}
													min={1}
													max={60}
													step={1}
													className="flex-1"
												/>
												<span className="text-xs text-muted-foreground w-8">{matchConfig.clipSizeMax}s</span>
											</div>
										</div>
									</div>

									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label>Video</Label>
											<Input
												type="number"
												min={1}
												max={100}
												value={matchConfig.maxVideoTracks}
												onChange={(e) => setMatchConfig({ ...matchConfig, maxVideoTracks: parseInt(e.target.value) || 1 })}
											/>
										</div>
										<div className="space-y-2">
											<Label>Audio</Label>
											<Input
												type="number"
												min={0}
												max={100}
												value={matchConfig.maxAudioTracks}
												onChange={(e) => setMatchConfig({ ...matchConfig, maxAudioTracks: parseInt(e.target.value) || 0 })}
											/>
										</div>
									</div>

									<div className="space-y-2">
										<div className="flex justify-between">
											<Label>Max Clips per Player</Label>
											<span className="text-sm text-muted-foreground">
												{matchConfig.maxClipsPerUser === 0 ? "Unlimited" : matchConfig.maxClipsPerUser}
											</span>
										</div>
										<Slider
											value={[matchConfig.maxClipsPerUser]}
											onValueChange={([v]) => setMatchConfig({ ...matchConfig, maxClipsPerUser: v })}
											min={0}
											max={50}
											step={1}
										/>
									</div>
								</div>
							</div>

							<DialogFooter>
								<Button variant="ghost" onClick={() => setShowCreateDialog(false)}>
									Cancel
								</Button>
								<Button onClick={handleCreateLobby} disabled={!lobbyName.trim() || isCreating}>
									{isCreating ? "..." : "Go"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
						<DialogTrigger asChild>
							<Button variant="outline" size="lg" className="gap-2">
								<HugeiconsIcon icon={QrCode01Icon} className="w-5 h-5" />
								Join
							</Button>
						</DialogTrigger>
						<DialogContent className="max-w-sm">
							<DialogHeader>
								<DialogTitle>Join</DialogTitle>
								<DialogDescription>Enter the 6-character lobby code to join.</DialogDescription>
							</DialogHeader>

							<div className="py-4">
								<Input
									placeholder="ABC123"
									value={joinCode}
									onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
									maxLength={6}
									className="text-center text-2xl tracking-widest font-mono"
								/>
							</div>

							<DialogFooter>
								<Button variant="ghost" onClick={() => setShowJoinDialog(false)}>
									Cancel
								</Button>
								<Button onClick={handleJoinByCode} disabled={joinCode.length !== 6 || joiningLobbyId !== null}>
									{joiningLobbyId !== null ? "..." : "Go"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<Dialog open={showActiveMatchDialog} onOpenChange={setShowActiveMatchDialog}>
						<DialogContent className="max-w-sm">
							<DialogHeader>
								<DialogTitle>Wait!</DialogTitle>
								<DialogDescription>
									You&apos;re currently in <span className="font-semibold">{activeMatch?.lobbyName}</span>. You need to finish or leave that
									match before joining another lobby.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter className="flex w-full justify-between">
								<Button className="w-full" variant="ghost" onClick={() => setShowActiveMatchDialog(false)}>
									Cancel
								</Button>
								<Button
									className="w-full"
									variant="destructive"
									onClick={async () => {
										try {
											const response = await fetch(`/api/matches/${activeMatch?.matchId}/leave`, {
												method: "POST",
											});
											if (!response.ok) {
												const data = await response.json();
												throw new Error(data.error || "Failed to leave match");
											}
											setShowActiveMatchDialog(false);
											window.location.reload();
										} catch (err) {
											toast.error(err instanceof Error ? err.message : "Failed to leave match");
										}
									}}
								>
									Leave
								</Button>
								<Button className="w-full" onClick={() => router.push(`/match/${activeMatch?.matchId}`)}>
									<HugeiconsIcon icon={LinkSquare01Icon} className="w-4 h-4" />
									Continue
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>

				<div className="space-y-4">
					<h2 className="text-lg font-semibold">Lobbies {lobbies.length == 0 ? "" : `(${lobbies.length})`}</h2>

					{lobbies.length === 0 ? (
						<Card className="p-12 text-center">
							<div className="flex flex-col items-center gap-4">
								<HugeiconsIcon icon={UserGroupIcon} className="w-12 h-12 text-muted-foreground/50" />
								<div>
									<p className="text-muted-foreground">No open lobbies right now</p>
									<p className="text-sm text-muted-foreground/70">Create one or wait!</p>
								</div>
							</div>
						</Card>
					) : (
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{[...lobbies]
								.sort((a, b) => {
									if (a.isSystemLobby && !b.isSystemLobby) return -1;
									if (!a.isSystemLobby && b.isSystemLobby) return 1;
									return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
								})
								.map((lobby) => (
									<LobbyCard
										key={lobby.id}
										lobby={lobby}
										onJoin={() => handleJoinLobby(lobby.id)}
										isJoining={joiningLobbyId === lobby.id}
									/>
								))}
						</div>
					)}
				</div>
			</main>
		</div>
	);
}

function LobbyCard({ lobby, onJoin, isJoining }: { lobby: LobbyListItemWithConfig; onJoin: () => void; isJoining: boolean }) {
	const [copied, setCopied] = useState(false);
	const [timeLeft, setTimeLeft] = useState<string | null>(null);
	const isRunning = lobby.status === "in_match" || lobby.status === "starting";

	useEffect(() => {
		if (!isRunning || !lobby.matchEndsAt) {
			setTimeLeft(null);
			return;
		}

		const updateTimeLeft = () => {
			const now = new Date();
			const endsAt = new Date(lobby.matchEndsAt!);
			const diffMs = endsAt.getTime() - now.getTime();

			if (diffMs <= 0) {
				setTimeLeft("0:00");
				return;
			}

			const totalSeconds = Math.floor(diffMs / 1000);
			const minutes = Math.floor(totalSeconds / 60);
			const seconds = totalSeconds % 60;
			setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`);
		};

		updateTimeLeft();
		const interval = setInterval(updateTimeLeft, 1000);

		return () => clearInterval(interval);
	}, [isRunning, lobby.matchEndsAt]);

	const copyCode = (e: React.MouseEvent) => {
		e.stopPropagation();
		navigator.clipboard.writeText(lobby.joinCode);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const getCardClassName = () => {
		let classes = "hover:border-primary/20 transition-colors";
		if (isRunning) {
			classes += " bg-yellow-500/10 border-yellow-500/30";
		} else if (lobby.isSystemLobby) {
			classes += " bg-primary/5 border-primary/20";
		}
		return classes;
	};

	const MAX_VISIBLE_PLAYERS = 10;
	const visiblePlayers = lobby.players.slice(0, MAX_VISIBLE_PLAYERS);
	const extraCount = lobby.playerCount - MAX_VISIBLE_PLAYERS;

	return (
		<Card className={getCardClassName()}>
			<CardContent className="p-4">
				<div className="flex gap-4">
					<div className="flex flex-col gap-2 shrink-0">
						<Badge variant="outline" className="font-mono cursor-pointer w-fit" onClick={copyCode}>
							{copied ? (
								<HugeiconsIcon icon={Tick01Icon} className="w-3 h-3 mr-1" />
							) : (
								<HugeiconsIcon icon={Copy01Icon} className="w-3 h-3 mr-1" />
							)}
							{lobby.joinCode}
						</Badge>

						{lobby.matchConfig && (
							<div className="flex flex-col gap-1">
								<MatchModifierBadges matchConfig={lobby.matchConfig} vertical />
							</div>
						)}
					</div>

					<div className="flex flex-col flex-1 min-w-0 gap-2">
						<div className="flex items-center gap-2">
							<h3 className="text-base font-semibold truncate">{lobby.name}</h3>
							{isRunning && (
								<Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-600 border-yellow-500/30 shrink-0 tabular-nums">
									{timeLeft ?? "Running"}
								</Badge>
							)}
						</div>

						<p className="text-xs text-muted-foreground truncate">
							{lobby.isSystemLobby && lobby.playerCount === 0 ? "Waiting for players..." : `@${lobby.hostUsername}`}
						</p>

						<div className="flex flex-col gap-1.5">
							<div className="flex items-center">
								{visiblePlayers.map((player, index) => (
									<Avatar key={player.id} className="w-6 h-6 border-2 border-background" style={{ marginLeft: index === 0 ? 0 : -8 }}>
										<AvatarImage src={player.image || undefined} />
										<AvatarFallback className="text-[10px]">{player.username.slice(0, 2).toUpperCase()}</AvatarFallback>
									</Avatar>
								))}
								{extraCount > 0 && (
									<div
										className="w-6 h-6 rounded-full bg-muted border-2 border-background flex items-center justify-center"
										style={{ marginLeft: -8 }}
									>
										<span className="text-[9px] font-medium text-muted-foreground">+{extraCount}</span>
									</div>
								)}
								{lobby.playerCount === 0 && (
									<div className="w-6 h-6 rounded-full bg-muted/50 border border-dashed border-border flex items-center justify-center">
										<HugeiconsIcon icon={UserGroupIcon} className="w-3 h-3 text-muted-foreground/50" />
									</div>
								)}
							</div>
							<span className="text-xs text-muted-foreground">
								{lobby.playerCount}/{lobby.maxPlayers} players
							</span>
						</div>

						<Button
							className="mt-auto"
							onClick={onJoin}
							disabled={isJoining || lobby.playerCount >= lobby.maxPlayers || lobby.status === "closed"}
						>
							{lobby.playerCount >= lobby.maxPlayers ? "Full" : lobby.status === "closed" ? "Closed" : isJoining ? "Joining..." : "Join"}
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
