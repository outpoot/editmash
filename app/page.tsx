"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePlayer } from "./hooks/usePlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserGroupIcon, Add01Icon, Copy01Icon, Tick01Icon, Video01Icon, QrCode01Icon } from "@hugeicons/core-free-icons";
import { LobbyListResponse, LobbyListItemWithConfig } from "./types/lobby";
import { MatchConfig, DEFAULT_MATCH_CONFIG } from "./types/match";
import { MatchModifierBadges } from "./components/MatchModifierBadges";
import { UserMenu } from "./components/UserMenu";

export default function MatchmakingPage() {
	const router = useRouter();
	const { playerId, username, isLoading: playerLoading, isAuthenticated } = usePlayer();

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
	const [isJoining, setIsJoining] = useState(false);

	const fetchLobbies = useCallback(async () => {
		try {
			const response = await fetch("/api/lobbies?status=waiting");
			if (!response.ok) throw new Error("Failed to fetch lobbies");
			const data: LobbyListResponse = await response.json();
			setLobbies(data.lobbies);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load lobbies");
		}
	}, []);

	useEffect(() => {
		fetchLobbies();
		const interval = setInterval(fetchLobbies, 5000);
		return () => clearInterval(interval);
	}, [fetchLobbies]);

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

		try {
			setIsJoining(true);
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
			setIsJoining(false);
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
						<h1 className="text-xl font-bold">EditMash</h1>
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
											<span className="text-sm text-muted-foreground">{(matchConfig.audioMaxVolume * 100).toFixed(0)}%</span>
										</div>
										<Slider
											value={[matchConfig.audioMaxVolume * 100]}
											onValueChange={([v]) => setMatchConfig({ ...matchConfig, audioMaxVolume: v / 100 })}
											min={50}
											max={200}
											step={10}
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
										<p className="text-xs text-muted-foreground">Set to 0 for unlimited clips per player</p>
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
								<Button onClick={handleJoinByCode} disabled={joinCode.length !== 6 || isJoining}>
									{isJoining ? "..." : "Go"}
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
							{lobbies.map((lobby) => (
								<LobbyCard key={lobby.id} lobby={lobby} onJoin={() => handleJoinLobby(lobby.id)} isJoining={isJoining} />
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

	const copyCode = (e: React.MouseEvent) => {
		e.stopPropagation();
		navigator.clipboard.writeText(lobby.joinCode);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<Card className="hover:border-primary/20 transition-colors">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div>
						<CardTitle className="text-base">{lobby.name}</CardTitle>
						<CardDescription>Hosted by @{lobby.hostUsername}</CardDescription>
					</div>
					<Badge variant="outline" className="font-mono cursor-pointer" onClick={copyCode}>
						{copied ? (
							<HugeiconsIcon icon={Tick01Icon} className="w-3 h-3 mr-1" />
						) : (
							<HugeiconsIcon icon={Copy01Icon} className="w-3 h-3 mr-1" />
						)}
						{lobby.joinCode}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="pb-3">
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-1 text-sm text-muted-foreground">
						<HugeiconsIcon icon={UserGroupIcon} className="w-4 h-4" />
						<span>
							{lobby.playerCount}/{lobby.maxPlayers}
						</span>
					</div>
					{lobby.matchConfig && <MatchModifierBadges matchConfig={lobby.matchConfig} />}
				</div>
			</CardContent>
			<CardFooter>
				<Button className="w-full" onClick={onJoin} disabled={isJoining || lobby.playerCount >= lobby.maxPlayers}>
					{lobby.playerCount >= lobby.maxPlayers ? "Full" : isJoining ? "Joining..." : "Join"}
				</Button>
			</CardFooter>
		</Card>
	);
}
