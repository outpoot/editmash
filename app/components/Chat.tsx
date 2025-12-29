"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMatchWebSocketOptional } from "./MatchWS";
import { viewSettingsStore } from "../store/viewSettingsStore";
import type { ChatMessageData } from "@/websocket/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { SentIcon } from "@hugeicons/core-free-icons";

const MESSAGE_VISIBLE_DURATION = 8000;
const MESSAGE_FADE_DURATION = 2000;
const UNFOCUS_DELAY = 1000;

interface ChatProps {
	className?: string;
}

export function Chat({ className = "" }: ChatProps) {
	const ws = useMatchWebSocketOptional();
	const [inputValue, setInputValue] = useState("");
	const [isActive, setIsActive] = useState(false);
	const [isHovered, setIsHovered] = useState(false);
	const [showChat, setShowChat] = useState(viewSettingsStore.getSettings().showChat);
	const inputRef = useRef<HTMLInputElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const unfocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const messageTimestampsRef = useRef<Map<string, number>>(new Map());
	const rafRef = useRef<number | null>(null);
	const [, forceUpdate] = useState(0);

	useEffect(() => {
		const unsubscribe = viewSettingsStore.subscribe(() => {
			setShowChat(viewSettingsStore.getSettings().showChat);
		});
		return () => { unsubscribe(); };
	}, []);

	const isFocused = isActive || isHovered;

	const chatMessages = ws?.chatMessages ?? [];

	useMemo(() => {
		const now = Date.now();
		const timestamps = messageTimestampsRef.current;

		for (const msg of chatMessages) {
			if (!timestamps.has(msg.messageId)) {
				timestamps.set(msg.messageId, now);
			}
		}

		const currentIds = new Set(chatMessages.map((m) => m.messageId));
		for (const key of timestamps.keys()) {
			if (!currentIds.has(key)) {
				timestamps.delete(key);
			}
		}
	}, [chatMessages]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [chatMessages.length]);

	useEffect(() => {
		if (isHovered && messagesContainerRef.current) {
			messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
		}
	}, [isHovered]);

	useEffect(() => {
		if (isFocused) {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			forceUpdate((n) => n + 1);
			return;
		}

		const hasActiveFade = () => {
			const now = Date.now();
			for (const [, timestamp] of messageTimestampsRef.current) {
				const elapsed = now - timestamp;
				if (elapsed >= MESSAGE_VISIBLE_DURATION && elapsed <= MESSAGE_VISIBLE_DURATION + MESSAGE_FADE_DURATION) {
					return true;
				}
			}
			return false;
		};

		let lastUpdate = 0;
		const animate = (time: number) => {
			// 60fps
			if (time - lastUpdate > 16) {
				lastUpdate = time;
				forceUpdate((n) => n + 1);
			}

			if (hasActiveFade() || chatMessages.length > 0) {
				rafRef.current = requestAnimationFrame(animate);
			}
		};

		rafRef.current = requestAnimationFrame(animate);

		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, [isFocused, chatMessages.length]);

	const handleFocusIn = useCallback(() => {
		if (unfocusTimeoutRef.current) {
			clearTimeout(unfocusTimeoutRef.current);
			unfocusTimeoutRef.current = null;
		}
		setIsActive(true);
	}, []);

	const handleFocusOut = useCallback(() => {
		unfocusTimeoutRef.current = setTimeout(() => {
			setIsActive(false);
		}, UNFOCUS_DELAY);
	}, []);

	const handleMouseEnter = useCallback(() => {
		if (unfocusTimeoutRef.current) {
			clearTimeout(unfocusTimeoutRef.current);
			unfocusTimeoutRef.current = null;
		}
		setIsHovered(true);
	}, []);

	const handleMouseLeave = useCallback(() => {
		setIsHovered(false);
	}, []);

	useEffect(() => {
		return () => {
			if (unfocusTimeoutRef.current) {
				clearTimeout(unfocusTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
				e.preventDefault();
				inputRef.current?.focus();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			if (!inputValue.trim() || !ws?.sendChatMessage) return;

			const result = ws.sendChatMessage(inputValue);
			if (result.success) {
				setInputValue("");
			}
		},
		[inputValue, ws]
	);

	const getMessageOpacity = useCallback(
		(messageId: string): number => {
			if (isFocused) return 1;

			const timestamp = messageTimestampsRef.current.get(messageId);
			if (!timestamp) return 0;

			const elapsed = Date.now() - timestamp;
			if (elapsed < MESSAGE_VISIBLE_DURATION) return 1;
			if (elapsed > MESSAGE_VISIBLE_DURATION + MESSAGE_FADE_DURATION) return 0;

			const fadeProgress = (elapsed - MESSAGE_VISIBLE_DURATION) / MESSAGE_FADE_DURATION;
			return 1 - fadeProgress;
		},
		[isFocused]
	);

	const getInitials = (name: string): string => {
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};

	if (!ws || !showChat) return null;

	const visibleMessages = chatMessages.filter((msg) => getMessageOpacity(msg.messageId) > 0);

	return (
		<div
			className={`fixed bottom-3 left-3 w-80 flex flex-col pointer-events-none ${className}`}
			style={{
				zIndex: 9999,
				transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
				transform: isFocused ? "scale(1)" : "scale(0.98)",
			}}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<div
				className="rounded-lg overflow-hidden pointer-events-auto"
				style={{
					transition: "background-color 300ms cubic-bezier(0.34, 1.56, 0.64, 1), backdrop-filter 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
					backgroundColor: isFocused ? "rgba(42, 52, 65, 0.95)" : "transparent",
					backdropFilter: isFocused ? "blur(12px)" : "none",
				}}
			>
				<div
					ref={messagesContainerRef}
					className="max-h-52 overflow-y-auto overflow-x-hidden chat-scrollbar"
					style={{
						maskImage: isFocused ? "none" : "linear-gradient(to bottom, transparent 0%, black 30%)",
						WebkitMaskImage: isFocused ? "none" : "linear-gradient(to bottom, transparent 0%, black 30%)",
					}}
				>
					<div className={`flex flex-col ${isFocused ? "p-3 pb-2" : "p-1"}`}>
						{visibleMessages.map((msg) => (
							<ChatMessage
								key={msg.messageId}
								message={msg}
								opacity={getMessageOpacity(msg.messageId)}
								getInitials={getInitials}
								isFocused={isFocused}
							/>
						))}
						<div ref={messagesEndRef} />
					</div>
				</div>

				<form onSubmit={handleSubmit} className={`relative ${isFocused ? "p-3 pt-1" : "p-1 pt-0.5"}`}>
					<div className="relative">
						<input
							ref={inputRef}
							type="text"
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onFocus={handleFocusIn}
							onBlur={handleFocusOut}
							placeholder="To chat click here or press / key"
							maxLength={200}
							className={`w-full pl-3 pr-10 py-2 text-sm rounded-lg transition-all duration-200
								${isFocused ? "bg-[#1e2730] border border-white/10" : "bg-black/50 backdrop-blur-md border border-white/[0.08]"}
								text-white/90 placeholder:text-white/30
								focus:outline-none`}
						/>
						<button
							type="submit"
							className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded transition-colors ${
								inputValue.trim() ? "text-white/70 hover:text-white" : "text-white/20"
							}`}
							disabled={!inputValue.trim()}
						>
							<HugeiconsIcon icon={SentIcon} size={16} />
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

interface ChatMessageProps {
	message: ChatMessageData;
	opacity: number;
	getInitials: (name: string) => string;
	isFocused: boolean;
}

function ChatMessage({ message, opacity, getInitials, isFocused }: ChatMessageProps) {
	const textShadow = isFocused ? "none" : "0 1px 3px rgba(0,0,0,0.8), 0 1px 8px rgba(0,0,0,0.6)";
	const isSystem = message.userId === "system";

	if (isSystem) {
		return (
			<div className="flex items-center gap-1.5 py-0.5 transition-opacity duration-200" style={{ opacity }}>
				<div className="text-sm leading-relaxed italic" style={{ textShadow }}>
					<span className="text-amber-400/90">{message.message}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1.5 py-0.5 transition-opacity duration-200" style={{ opacity }}>
			<Avatar className="h-5 w-5 shrink-0" style={{ filter: isFocused ? "none" : "drop-shadow(0 1px 2px rgba(0,0,0,0.8))" }}>
				<AvatarImage src={message.userImage} alt={message.username} />
				<AvatarFallback
					className="text-[7px] font-semibold"
					style={{ backgroundColor: message.highlightColor + "30", color: message.highlightColor }}
				>
					{getInitials(message.username)}
				</AvatarFallback>
			</Avatar>
			<div className="text-sm leading-relaxed" style={{ textShadow }}>
				<span className="font-semibold" style={{ color: message.highlightColor }}>
					{message.username}
				</span>
				<span className="text-white/50">: </span>
				<span className="text-white">{message.message}</span>
			</div>
		</div>
	);
}
