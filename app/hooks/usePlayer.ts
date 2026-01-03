"use client";

import { useSession } from "@/lib/auth-client";
import { useState, useEffect } from "react";

interface ActiveMatch {
	matchId: string;
	lobbyName: string;
}

interface ActiveLobby {
	lobbyId: string;
	lobbyName: string;
}

export function usePlayer() {
	const { data: session, isPending } = useSession();
	const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);
	const [activeLobby, setActiveLobby] = useState<ActiveLobby | null>(null);
	const [activeMatchLoading, setActiveMatchLoading] = useState(false);

	useEffect(() => {
		if (!session?.user?.id) {
			setActiveMatch(null);
			setActiveLobby(null);
			return;
		}

		const controller = new AbortController();

		const fetchActiveMatch = async () => {
			setActiveMatchLoading(true);
			try {
				const response = await fetch("/api/user", {
					signal: controller.signal,
				});
				if (controller.signal.aborted) return;
				if (response.ok) {
					const data = await response.json();
					if (controller.signal.aborted) return;
					setActiveMatch(data.activeMatch || null);
					setActiveLobby(data.activeLobby || null);
				} else {
					console.error(`Error fetching active match: ${response.status} ${response.statusText}`);
					setActiveMatch(null);
					setActiveLobby(null);
				}
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					return;
				}
				console.error("Error fetching active match:", error);
			} finally {
				if (!controller.signal.aborted) {
					setActiveMatchLoading(false);
				}
			}
		};

		fetchActiveMatch();

		return () => {
			controller.abort();
		};
	}, [session?.user?.id]);

	return {
		playerId: session?.user?.id ?? null,
		username: session?.user?.name ?? null,
		email: session?.user?.email ?? null,
		image: session?.user?.image ?? null,
		isLoading: isPending,
		isAuthenticated: !!session,
		session,
		activeMatch,
		activeLobby,
		activeMatchLoading,
	};
}
