"use client";

import { useRef, useCallback, useEffect } from "react";

export function useMatchSounds() {
	const audioContextRef = useRef<AudioContext | null>(null);
	const hasPlayedStartSound = useRef(false);
	const lastTickSecond = useRef<number | null>(null);

	const getAudioContext = useCallback((): AudioContext => {
		if (!audioContextRef.current) {
			audioContextRef.current = new AudioContext();
		}
		return audioContextRef.current;
	}, []);

	const playBeep = useCallback((frequency: number, duration: number, volume: number = 0.3) => {
		try {
			const ctx = getAudioContext();

			if (ctx.state === "suspended") {
				ctx.resume();
			}

			const oscillator = ctx.createOscillator();
			const gainNode = ctx.createGain();

			oscillator.connect(gainNode);
			gainNode.connect(ctx.destination);

			oscillator.type = "sine";
			oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

			gainNode.gain.setValueAtTime(0, ctx.currentTime);
			gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
			gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

			oscillator.start(ctx.currentTime);
			oscillator.stop(ctx.currentTime + duration);
		} catch (error) {
			console.warn("Failed to play sound:", error);
		}
	}, [getAudioContext]);

	const playMatchStartSound = useCallback(() => {
		if (hasPlayedStartSound.current) return;
		hasPlayedStartSound.current = true;

		try {
			const ctx = getAudioContext();

			if (ctx.state === "suspended") {
				ctx.resume();
			}

			const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
			const baseTime = ctx.currentTime;

			notes.forEach((freq, i) => {
				const oscillator = ctx.createOscillator();
				const gainNode = ctx.createGain();

				oscillator.connect(gainNode);
				gainNode.connect(ctx.destination);

				oscillator.type = "sine";
				oscillator.frequency.setValueAtTime(freq, baseTime);

				const startTime = baseTime + i * 0.08;
				const duration = 0.4 - i * 0.05;

				gainNode.gain.setValueAtTime(0, startTime);
				gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
				gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

				oscillator.start(startTime);
				oscillator.stop(startTime + duration);
			});
		} catch (error) {
			console.warn("Failed to play match start sound:", error);
		}
	}, [getAudioContext]);

	const playCountdownTick = useCallback(
		(secondsRemaining: number) => {
			const currentSecond = Math.floor(secondsRemaining);
			if (lastTickSecond.current === currentSecond) return;
			lastTickSecond.current = currentSecond;

			if (currentSecond <= 3 && currentSecond > 0) {
				playBeep(880, 0.15, 0.4); // A5
			} else if (currentSecond <= 10 && currentSecond > 3) {
				playBeep(660, 0.1, 0.25); // E5
			}

			if (currentSecond === 0 && secondsRemaining > 0 && secondsRemaining < 1) {
				try {
					const ctx = getAudioContext();
					const baseTime = ctx.currentTime;

					const oscillator = ctx.createOscillator();
					const gainNode = ctx.createGain();

					oscillator.connect(gainNode);
					gainNode.connect(ctx.destination);

					oscillator.type = "sine";
					oscillator.frequency.setValueAtTime(880, baseTime);
					oscillator.frequency.exponentialRampToValueAtTime(220, baseTime + 0.5);

					gainNode.gain.setValueAtTime(0, baseTime);
					gainNode.gain.linearRampToValueAtTime(0.4, baseTime + 0.02);
					gainNode.gain.exponentialRampToValueAtTime(0.001, baseTime + 0.5);

					oscillator.start(baseTime);
					oscillator.stop(baseTime + 0.5);
				} catch (error) {
					console.warn("Failed to play end sound:", error);
				}
			}
		},
		[playBeep, getAudioContext]
	);

	useEffect(() => {
		return () => {
			hasPlayedStartSound.current = false;
			lastTickSecond.current = null;
			if (audioContextRef.current) {
				audioContextRef.current.close();
				audioContextRef.current = null;
			}
		};
	}, []);

	return {
		playMatchStartSound,
		playCountdownTick,
	};
}
