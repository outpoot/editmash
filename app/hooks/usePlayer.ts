"use client";

import { useState, useEffect } from "react";

function generatePlayerId(): string {
	return `player-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function usePlayerId() {
	const [playerId, setPlayerId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let id = localStorage.getItem("editmash_player_id");

		if (!id) {
			id = generatePlayerId();
			localStorage.setItem("editmash_player_id", id);
		}

		setPlayerId(id);
		setIsLoading(false);
	}, []);

	const resetPlayerId = () => {
		const newId = generatePlayerId();
		localStorage.setItem("editmash_player_id", newId);
		setPlayerId(newId);
		return newId;
	};

	return { playerId, isLoading, resetPlayerId };
}

export function useUsername() {
	const [username, setUsernameState] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const stored = localStorage.getItem("editmash_username");
		setUsernameState(stored);
		setIsLoading(false);
	}, []);

	const setUsername = (name: string) => {
		localStorage.setItem("editmash_username", name);
		setUsernameState(name);
	};

	const clearUsername = () => {
		localStorage.removeItem("editmash_username");
		setUsernameState(null);
	};

	return { username, setUsername, clearUsername, isLoading };
}
