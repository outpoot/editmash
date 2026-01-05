"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HugeiconsIcon } from "@hugeicons/react";
import { SentIcon, Message01Icon } from "@hugeicons/core-free-icons";
import {
	serializeMessage,
	deserializeMessage,
	createLobbyChatMessage,
	createRequestLobbyChatHistory,
	isLobbyChatBroadcast,
	type LobbyChatMessageData,
} from "@/websocket/types";

interface LobbyChatProps {
	lobbyId: string;
	currentUserId: string;
	currentUsername: string;
	currentUserImage?: string;
	wsRef: React.MutableRefObject<WebSocket | null>;
	className?: string;
}

export function LobbyChat({ lobbyId, currentUserId, wsRef, className = "" }: LobbyChatProps) {
	const [messages, setMessages] = useState<LobbyChatMessageData[]>([]);
	const [inputValue, setInputValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const ws = wsRef.current;
		if (!ws) return;

		const handleMessage = (event: MessageEvent) => {
			if (typeof event.data === "string") return;

			try {
				const bytes = new Uint8Array(event.data);
				const msg = deserializeMessage(bytes);

				if (isLobbyChatBroadcast(msg) && msg.payload.value) {
					const payload = msg.payload.value;
					if (payload.lobbyId === lobbyId) {
						const newMessage: LobbyChatMessageData = {
							messageId: payload.messageId,
							userId: payload.userId,
							username: payload.username,
							userImage: payload.userImage,
							message: payload.message,
							timestamp: Number(payload.timestamp),
						};
						setMessages((prev) => {
							if (prev.some((m) => m.messageId === newMessage.messageId)) {
								return prev;
							}
							return [...prev, newMessage].slice(-50);
						});
					}
				}
			} catch {
				// Ignore parse errors
			}
		};

		const handleOpen = () => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(serializeMessage(createRequestLobbyChatHistory(lobbyId)));
			}
		};

		ws.addEventListener("message", handleMessage);
		ws.addEventListener("open", handleOpen);

		if (ws.readyState === WebSocket.OPEN) {
			ws.send(serializeMessage(createRequestLobbyChatHistory(lobbyId)));
		}

		return () => {
			ws.removeEventListener("message", handleMessage);
			ws.removeEventListener("open", handleOpen);
		};
	}, [lobbyId, wsRef]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length]);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const trimmed = inputValue.trim();
			if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

			wsRef.current.send(serializeMessage(createLobbyChatMessage(lobbyId, trimmed)));
			setInputValue("");
		},
		[inputValue, lobbyId, wsRef]
	);

	const getInitials = (name: string): string => {
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};

	const formatTime = (timestamp: number): string => {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
	};

	return (
		<Card className={`flex flex-col ${className}`}>
			<CardHeader className="pb-3">
				<CardTitle className="text-base flex items-center gap-2">
					<HugeiconsIcon icon={Message01Icon} className="w-4 h-4" />
					Chat
				</CardTitle>
			</CardHeader>
			<CardContent className="flex-1 flex flex-col p-0 min-h-0">
				<ScrollArea className="flex-1 px-4">
					<div className="flex flex-col pb-2">
						{messages.length === 0 ? (
							<p className="text-sm text-muted-foreground text-center py-4">No messages yet. Say hi!</p>
						) : (
							messages.map((msg) => (
								<ChatMessage
									key={msg.messageId}
									message={msg}
									getInitials={getInitials}
									formatTime={formatTime}
									isCurrentUser={msg.userId === currentUserId}
								/>
							))
						)}
						<div ref={messagesEndRef} />
					</div>
				</ScrollArea>

				<form onSubmit={handleSubmit} className="p-4 pt-2 border-t">
					<div className="relative">
						<input
							ref={inputRef}
							type="text"
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							placeholder="Type a message..."
							maxLength={200}
							className="w-full pl-3 pr-10 py-2 text-sm rounded-lg bg-muted/50 border border-border
								text-foreground placeholder:text-muted-foreground
								focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
						/>
						<button
							type="submit"
							className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded transition-colors ${
								inputValue.trim() ? "text-foreground hover:text-foreground-border/80" : "text-muted-foreground/50"
							}`}
							disabled={!inputValue.trim()}
						>
							<HugeiconsIcon icon={SentIcon} size={16} />
						</button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

interface ChatMessageProps {
	message: LobbyChatMessageData;
	getInitials: (name: string) => string;
	formatTime: (timestamp: number) => string;
	isCurrentUser: boolean;
}

function ChatMessage({ message, getInitials, formatTime }: ChatMessageProps) {
	const isSystem = message.userId === "system";

	if (isSystem) {
		return (
			<div className="flex items-center gap-1.5 py-0.5">
				<span className="text-xs text-muted-foreground/60 font-mono shrink-0">{formatTime(message.timestamp)}</span>
				<div className="text-sm leading-relaxed italic">
					<span className="text-amber-500">{message.message}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1.5 py-0.5">
			<span className="text-xs text-muted-foreground/60 font-mono shrink-0">{formatTime(message.timestamp)}</span>
			<Avatar className="h-5 w-5 shrink-0">
				<AvatarImage src={message.userImage} alt={message.username} />
				<AvatarFallback className="text-[7px] font-semibold bg-primary/20 text-primary">{getInitials(message.username)}</AvatarFallback>
			</Avatar>
			<div className="text-sm leading-relaxed">
				<span className="font-semibold text-primary">{message.username}</span>
				<span className="text-muted-foreground">: </span>
				<span className="text-foreground">{message.message}</span>
			</div>
		</div>
	);
}
