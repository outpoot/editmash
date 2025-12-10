"use client";

import { useState, useEffect, useRef } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { mediaStore, MediaItem } from "../store/mediaStore";
import { Folder, Image, Video, Music } from "lucide-react";

let currentDragItem: MediaItem | null = null;

export function getCurrentDragItem() {
	return currentDragItem;
}

export default function MediaBrowser() {
	const [activeFolder, setActiveFolder] = useState<string | null>("All");
	const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const folders = ["All", "Footage", "Audio", "Graphics", "Titles", "Effects"];

	useEffect(() => {
		const unsubscribe = mediaStore.subscribe(() => {
			setMediaItems(mediaStore.getItems());
		});

		setMediaItems(mediaStore.getItems());

		const handleBeforeUnload = () => {
			mediaStore.cleanup();
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			unsubscribe();
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, []);

	useEffect(() => {
		const handleClick = () => setContextMenu(null);
		window.addEventListener("click", handleClick);
		return () => window.removeEventListener("click", handleClick);
	}, []);

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY });
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (!files) return;

		Array.from(files).forEach((file) => {
			const url = URL.createObjectURL(file);
			const type = file.type.startsWith("video/") ? "video" : "audio";

			// get duration
			const element = type === "video" ? document.createElement("video") : document.createElement("audio");

			element.src = url;
			element.preload = "metadata";

			element.addEventListener("loadedmetadata", () => {
				const mediaItem: MediaItem = {
					id: `${Date.now()}-${Math.random()}`,
					name: file.name,
					type,
					url,
					duration: element.duration,
					width: type === "video" ? (element as HTMLVideoElement).videoWidth : undefined,
					height: type === "video" ? (element as HTMLVideoElement).videoHeight : undefined,
				};

				// generate thumbnail
				if (type === "video") {
					const video = element as HTMLVideoElement;
					const canvas = document.createElement("canvas");
					canvas.width = 320;
					canvas.height = 180;
					const ctx = canvas.getContext("2d");

					video.currentTime = 0.1;
					video.addEventListener(
						"seeked",
						() => {
							if (ctx) {
								ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
								mediaItem.thumbnail = canvas.toDataURL("image/jpeg", 0.7);
								mediaStore.addItem(mediaItem);
							}
						},
						{ once: true }
					);
				} else {
					mediaStore.addItem(mediaItem);
				}
			});
		});

		e.target.value = "";
	};

	const handleImportClick = () => {
		setContextMenu(null);
		fileInputRef.current?.click();
	};

	return (
		<>
			<input ref={fileInputRef} type="file" accept="video/*,audio/*" multiple className="hidden" onChange={handleFileSelect} />

			{contextMenu && (
				<div
					className="fixed z-[9999] bg-[#2a2a2a] border border-zinc-700 rounded shadow-lg py-1 min-w-[160px]"
					style={{ left: contextMenu.x, top: contextMenu.y }}
					onClick={(e) => e.stopPropagation()}
				>
					<button
						onClick={handleImportClick}
						className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700/50 transition-colors"
					>
						Import Media...
					</button>
				</div>
			)}

			<ResizablePanelGroup direction="horizontal" className="h-full">
				<ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
					<div className="h-full bg-[#1e1e1e] border-r border-zinc-800">
						<div className="p-2">
							<button className="w-full px-4 py-2 text-left text-sm text-zinc-300 bg-zinc-800/50 hover:bg-zinc-700/50 rounded transition-colors">
								Master
							</button>
						</div>

						<ResizablePanelGroup direction="vertical">
							<ResizablePanel defaultSize={50} minSize={5}>
								<div className="h-full bg-[#1a1a1a] p-2">{/* Empty panel */}</div>
							</ResizablePanel>

							<ResizableHandle />

							<ResizablePanel defaultSize={50} minSize={5}>
								<div className="h-full flex flex-col bg-[#1e1e1e]">
									<div className="px-3 py-2 text-xs font-medium text-zinc-400 border-b border-zinc-800">Power Bins</div>
									<div className="flex-1 overflow-y-auto p-2">
										<div className="space-y-1">
											{folders.map((folder) => (
												<button
													key={folder}
													onClick={() => setActiveFolder(folder)}
													className={`w-full px-3 py-2 text-left text-sm rounded transition-colors flex items-center gap-2 ${
														activeFolder === folder ? "bg-blue-600/20 text-blue-400" : "text-zinc-300 hover:bg-zinc-800/50"
													}`}
												>
													<Folder className="flex-shrink-0" size={16} />
													{folder}
												</button>
											))}
										</div>
									</div>
								</div>
							</ResizablePanel>
						</ResizablePanelGroup>
					</div>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel defaultSize={75}>
					<div className="h-full bg-[#1a1a1a] overflow-y-auto p-4" onContextMenu={handleContextMenu}>
						{mediaItems.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-full text-zinc-500">
								<Image size={64} strokeWidth={1.5} className="mb-4" />
								<p className="text-sm">No media imported</p>
								<p className="text-xs mt-1">Right-click to import media</p>
							</div>
						) : (
							<div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, 155px)", justifyContent: "space-evenly" }}>
								{mediaItems.map((item) => (
									<div
										key={item.id}
										className="group cursor-pointer w-[155px]"
										draggable
										onDragStart={(e) => {
											e.dataTransfer.setData("application/media-item", JSON.stringify(item));
											e.dataTransfer.effectAllowed = "copy";
											currentDragItem = item;
										}}
										onDragEnd={() => {
											currentDragItem = null;
										}}
									>
										<div className="w-[155px] h-[90px] bg-zinc-800 rounded overflow-hidden mb-2 hover:ring-2 hover:ring-blue-500 flex items-center justify-center">
											{item.type === "video" && item.thumbnail ? (
												<img src={item.thumbnail} alt={item.name} className="w-full h-full object-cover" />
											) : item.type === "video" ? (
												<Video size={32} strokeWidth={1.5} className="text-zinc-600" />
											) : (
												<Music size={32} strokeWidth={1.5} className="text-zinc-600" />
											)}
										</div>
										<p className="text-sm text-zinc-400 group-hover:text-zinc-200 text-center truncate px-1">{item.name}</p>
									</div>
								))}
							</div>
						)}
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</>
	);
}
