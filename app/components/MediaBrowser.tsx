"use client";

import { useState, useEffect, useRef } from "react";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { mediaStore, MediaItem, generateThumbnail, DEFAULT_IMAGE_DURATION } from "../store/mediaStore";
import { HugeiconsIcon } from "@hugeicons/react";
import { Image01Icon, Video01Icon, MusicNote01Icon } from "@hugeicons/core-free-icons";
import { validateFile, getAcceptAttribute } from "@/lib/validation";
import { toast } from "sonner";
import { useAudioWaveform } from "../hooks/useAudioWaveform";
import { useMatchWebSocketOptional } from "./MatchWS";
import { usePlayer } from "../hooks/usePlayer";

let currentDragItem: MediaItem | null = null;

export function getCurrentDragItem() {
	return currentDragItem;
}

function AudioWaveformPreview({ src, isUploading }: { src: string; isUploading?: boolean }) {
	const peaks = useAudioWaveform(isUploading ? "" : src, 50);

	if (peaks.length === 0) {
		return <HugeiconsIcon icon={MusicNote01Icon} size={32} strokeWidth={1.5} className="text-muted-foreground" />;
	}

	return (
		<div className="w-full h-full flex items-center justify-center px-1 bg-green-600">
			<svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${peaks.length} 2`}>
				<path
					d={peaks
						.map((peak, i) => {
							const x = i + 0.5;
							const yMax = 1 - peak.max;
							const yMin = 1 - peak.min;

							if (i === 0) {
								return `M ${x} ${yMax} L ${x} ${yMin}`;
							}
							return `L ${x} ${yMax} L ${x} ${yMin}`;
						})
						.join(" ")}
					fill="none"
					stroke="rgba(255, 255, 255, 0.8)"
					strokeWidth="1"
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={
						peaks
							.map((peak, i) => {
								const x = i + 0.5;
								const yMax = 1 - peak.max;
								if (i === 0) return `M ${x} 1 L ${x} ${yMax}`;
								return `L ${x} ${yMax}`;
							})
							.join(" ") +
						" " +
						peaks
							.slice()
							.reverse()
							.map((peak, i) => {
								const x = peaks.length - i - 0.5;
								const yMin = 1 - peak.min;
								return `L ${x} ${yMin}`;
							})
							.join(" ") +
						" Z"
					}
					fill="rgba(255, 255, 255, 0.6)"
					stroke="none"
				/>
			</svg>
		</div>
	);
}

export default function MediaBrowser() {
	const [activeFolder, setActiveFolder] = useState<string | null>("All");
	const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const matchWs = useMatchWebSocketOptional();
	const { playerId, username } = usePlayer();

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

	const saveMediaToDatabase = async (tempId: string, name: string, type: string, url: string, fileId?: string): Promise<string | null> => {
		if (!matchWs?.matchId) return null;

		try {
			const response = await fetch(`/api/matches/${matchWs.matchId}/media`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, type, url, fileId }),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				console.error("Failed to save media to database:", {
					status: response.status,
					statusText: response.statusText,
					error: errorData,
					tempId,
					name,
				});
				return null;
			}

			const data = await response.json();
			const dbId = data.id;

			if (dbId && dbId !== tempId) {
				mediaStore.updateItemId(tempId, dbId);
			}

			return dbId ?? null;
		} catch (error) {
			console.error("Error saving media to database:", error, { tempId, name });
			return null;
		}
	};

	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (!files) return;

		for (const file of Array.from(files)) {
			const validation = validateFile({
				name: file.name,
				size: file.size,
				type: file.type,
			});

			if (!validation.valid) {
				toast.error(validation.message || "Invalid file", {
					description: file.name,
				});
				continue;
			}

			const tempUrl = URL.createObjectURL(file);
			const type: "video" | "audio" | "image" =
				validation.category === "video" ? "video" : validation.category === "image" ? "image" : "audio";
			const itemId = `${Date.now()}-${Math.random()}`;

			// image
			if (type === "image") {
				const img = document.createElement("img");
				img.src = tempUrl;

				img.addEventListener("error", () => {
					URL.revokeObjectURL(tempUrl);
					toast.error("Failed to load image", {
						description: file.name,
					});
				});

				img.addEventListener("load", async () => {
					const thumbnail = generateThumbnail(img, img.naturalWidth, img.naturalHeight);

					const mediaItem: MediaItem = {
						id: itemId,
						name: file.name,
						type: "image",
						url: tempUrl,
						duration: DEFAULT_IMAGE_DURATION,
						width: img.naturalWidth,
						height: img.naturalHeight,
						thumbnail,
						isUploading: true,
						uploadedBy: playerId ?? undefined,
						uploaderName: username ?? undefined,
					};

					mediaStore.addItem(mediaItem);

					try {
						const formData = new FormData();
						formData.append("file", file);

						const xhr = new XMLHttpRequest();

						xhr.upload.addEventListener("progress", (e) => {
							if (e.lengthComputable) {
								const progress = Math.round((e.loaded / e.total) * 100);
								mediaStore.updateItem(itemId, { uploadProgress: progress });
							}
						});

						const uploadPromise = new Promise<{ url: string; fileId: string }>((resolve, reject) => {
							xhr.addEventListener("load", () => {
								if (xhr.status >= 200 && xhr.status < 300) {
									resolve(JSON.parse(xhr.responseText));
								} else {
									reject(new Error(`Upload failed: ${xhr.status}`));
								}
							});
							xhr.addEventListener("error", () => reject(new Error("Network error")));
							xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

							xhr.open("POST", "/api/upload");
							xhr.send(formData);
						});

						const data = await uploadPromise;

						mediaStore.updateItem(itemId, {
							url: data.url,
							fileId: data.fileId,
							isUploading: false,
							uploadProgress: 100,
						});

						const dbId = await saveMediaToDatabase(itemId, file.name, type, data.url, data.fileId);
						if (!dbId) {
							toast.warning("Media uploaded but may not persist after refresh", {
								description: file.name,
							});
						} else if (matchWs?.status === "connected") {
							const updatedItem = mediaStore.getItemById(dbId);
							if (updatedItem) {
								matchWs.broadcastMediaUploaded({ ...updatedItem, url: data.url, fileId: data.fileId });
							}
						}

						URL.revokeObjectURL(tempUrl);
					} catch (error) {
						console.error("Error uploading to B2:", error);

						const errorMessage = error instanceof Error ? error.message : "Upload failed";
						mediaStore.updateItem(itemId, {
							isUploading: false,
							uploadError: errorMessage,
						});

						URL.revokeObjectURL(tempUrl);
					}
				});

				continue;
			}

			// video/audio
			const element = type === "video" ? document.createElement("video") : document.createElement("audio");
			element.src = tempUrl;
			element.preload = "metadata";

			element.addEventListener("loadedmetadata", async () => {
				const mediaItem: MediaItem = {
					id: itemId,
					name: file.name,
					type,
					url: tempUrl,
					duration: element.duration,
					width: type === "video" ? (element as HTMLVideoElement).videoWidth : undefined,
					height: type === "video" ? (element as HTMLVideoElement).videoHeight : undefined,
					isUploading: true,
					uploadedBy: playerId ?? undefined,
					uploaderName: username ?? undefined,
				};

				mediaStore.addItem(mediaItem);

				// upload to server
				try {
					const formData = new FormData();
					formData.append("file", file);

					const xhr = new XMLHttpRequest();

					xhr.upload.addEventListener("progress", (e) => {
						if (e.lengthComputable) {
							const progress = Math.round((e.loaded / e.total) * 100);
							mediaStore.updateItem(itemId, { uploadProgress: progress });
						}
					});

					const uploadPromise = new Promise<{ url: string; fileId: string }>((resolve, reject) => {
						xhr.addEventListener("load", () => {
							if (xhr.status >= 200 && xhr.status < 300) {
								resolve(JSON.parse(xhr.responseText));
							} else {
								reject(new Error(`Upload failed: ${xhr.status}`));
							}
						});
						xhr.addEventListener("error", () => reject(new Error("Network error")));
						xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

						xhr.open("POST", "/api/upload");
						xhr.send(formData);
					});

					const data = await uploadPromise;

					mediaStore.updateItem(itemId, {
						url: data.url,
						fileId: data.fileId,
						isUploading: false,
						uploadProgress: 100,
					});

					const dbId = await saveMediaToDatabase(itemId, file.name, type, data.url, data.fileId);
					if (!dbId) {
						toast.warning("Media uploaded but may not persist after refresh", {
							description: file.name,
						});
					} else if (matchWs?.status === "connected") {
						const updatedItem = mediaStore.getItemById(dbId);
						if (updatedItem) {
							matchWs.broadcastMediaUploaded({ ...updatedItem, url: data.url, fileId: data.fileId });
						}
					}

					URL.revokeObjectURL(tempUrl);
				} catch (error) {
					console.error("Error uploading to B2:", error);

					const errorMessage = error instanceof Error ? error.message : "Upload failed";
					mediaStore.updateItem(itemId, {
						isUploading: false,
						uploadError: errorMessage,
					});

					URL.revokeObjectURL(tempUrl);
				}
			});
		}

		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const handleImportClick = () => {
		setContextMenu(null);
		fileInputRef.current?.click();
	};

	return (
		<>
			<input ref={fileInputRef} type="file" accept={getAcceptAttribute()} multiple className="hidden" onChange={handleFileSelect} />

			{contextMenu && (
				<div
					className="fixed z-9999 bg-popover border border-border rounded shadow-lg py-1 min-w-40"
					style={{ left: contextMenu.x, top: contextMenu.y }}
					onClick={(e) => e.stopPropagation()}
				>
					<button
						onClick={handleImportClick}
						className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors"
					>
						Import Media...
					</button>
				</div>
			)}

			<ResizablePanelGroup direction="horizontal" className="h-full">
				<ResizablePanel defaultSize={10}>
					<div className="h-full bg-background overflow-y-auto p-4" onContextMenu={handleContextMenu}>
						{mediaItems.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-full text-muted-foreground">
								<HugeiconsIcon icon={Image01Icon} size={64} strokeWidth={1.5} className="mb-4" />
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
										<div className="w-[155px] h-[90px] bg-secondary rounded overflow-hidden mb-2 hover:ring-2 hover:ring-primary flex items-center justify-center relative">
											{item.isUploading && (
												<div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10 p-2">
													<div className="text-xs text-white mb-2">{item.uploadProgress ? `${item.uploadProgress}%` : "Uploading..."}</div>
													{item.uploadProgress !== undefined && (
														<div className="w-full h-1 bg-secondary rounded overflow-hidden">
															<div className="h-full bg-primary transition-all duration-300" style={{ width: `${item.uploadProgress}%` }} />
														</div>
													)}
												</div>
											)}
											{item.isDownloading && (
												<div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10 p-2">
													<div className="text-xs text-white mb-2">Downloading...</div>
												</div>
											)}
											{(item.uploadError || item.downloadError) && (
												<div className="absolute inset-0 bg-red-900/70 flex items-center justify-center z-10 p-2">
													<div className="text-xs text-white text-center">{item.uploadError || item.downloadError}</div>
												</div>
											)}
											{item.type === "video" && item.thumbnail ? (
												<img src={item.thumbnail} alt={item.name} className="w-full h-full object-cover" />
											) : item.type === "video" ? (
												<HugeiconsIcon icon={Video01Icon} size={32} strokeWidth={1.5} className="text-muted-foreground" />
											) : item.type === "image" && item.thumbnail ? (
												<img src={item.thumbnail} alt={item.name} className="w-full h-full object-cover" />
											) : item.type === "image" ? (
												<HugeiconsIcon icon={Image01Icon} size={32} strokeWidth={1.5} className="text-muted-foreground" />
											) : (
												<AudioWaveformPreview src={item.url} isUploading={item.isUploading} />
											)}
										</div>
										<p className="text-sm text-muted-foreground group-hover:text-foreground text-center truncate px-1">{item.name}</p>
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
