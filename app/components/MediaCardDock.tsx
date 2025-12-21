"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import MediaCard from "./MediaCard";
import { mediaStore, MediaItem, generateThumbnail, DEFAULT_IMAGE_DURATION } from "../store/mediaStore";
import { validateFile, getAcceptAttribute } from "@/lib/validation";
import { toast } from "sonner";
import { useMatchWebSocketOptional } from "./MatchWS";

interface MediaCardDockProps {
	maxClips?: number;
}

let currentDragItem: MediaItem | null = null;

export function getCurrentDragItem() {
	return currentDragItem;
}

export default function MediaCardDock({ maxClips = 10 }: MediaCardDockProps) {
	const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const matchWs = useMatchWebSocketOptional();

	const myMediaItems = mediaItems.filter((item) => !item.isDownloading || item.isUploading);

	useEffect(() => {
		const unsubscribe = mediaStore.subscribe(() => {
			setMediaItems(mediaStore.getItems());
		});
		setMediaItems(mediaStore.getItems());

		return () => {
			unsubscribe();
		};
	}, []);

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

	const handleFileSelect = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			if (!files) return;

			const currentCount = myMediaItems.length;
			const remainingSlots = maxClips - currentCount;

			if (remainingSlots <= 0) {
				toast.error(`Maximum ${maxClips} clips allowed`);
				return;
			}

			const filesToProcess = Array.from(files).slice(0, remainingSlots);

			if (files.length > remainingSlots) {
				toast.warning(`Only ${remainingSlots} more clip${remainingSlots === 1 ? "" : "s"} allowed. Some files were not imported.`);
			}

			for (const file of filesToProcess) {
				const validation = validateFile({
					name: file.name,
					size: file.size,
					type: file.type,
				});

				if (!validation.valid) {
					toast.error(validation.message || "Invalid file", { description: file.name });
					continue;
				}

				const tempUrl = URL.createObjectURL(file);
				const type: "video" | "audio" | "image" =
					validation.category === "video" ? "video" : validation.category === "image" ? "image" : "audio";
				const itemId = `${Date.now()}-${Math.random()}`;

				if (type === "image") {
					const img = document.createElement("img");
					img.src = tempUrl;

					img.addEventListener("error", () => {
						URL.revokeObjectURL(tempUrl);
						toast.error("Failed to load image", { description: file.name });
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
						};

						mediaStore.addItem(mediaItem);
						await uploadFile(file, itemId, type, tempUrl);
					});
					continue;
				}

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
					};

					mediaStore.addItem(mediaItem);

					if (type === "video") {
						const video = element as HTMLVideoElement;
						video.currentTime = 0.1;
						video.addEventListener(
							"seeked",
							() => {
								const thumbnail = generateThumbnail(video, video.videoWidth, video.videoHeight);
								mediaStore.updateItem(itemId, { thumbnail });
							},
							{ once: true }
						);
					}

					await uploadFile(file, itemId, type, tempUrl);
				});
			}

			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		},
		[myMediaItems.length, maxClips, matchWs]
	);

	const uploadFile = async (file: File, itemId: string, type: "video" | "audio" | "image", tempUrl: string) => {
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
				toast.warning("Media uploaded but may not persist after refresh", { description: file.name });
			} else if (matchWs?.status === "connected") {
				const updatedItem = mediaStore.getItemById(dbId);
				if (updatedItem) {
					matchWs.broadcastMediaUploaded({ ...updatedItem, url: data.url, fileId: data.fileId });
				}
			}

			URL.revokeObjectURL(tempUrl);
		} catch (error) {
			console.error("Error uploading:", error);
			const errorMessage = error instanceof Error ? error.message : "Upload failed";
			mediaStore.updateItem(itemId, {
				isUploading: false,
				uploadError: errorMessage,
			});
			URL.revokeObjectURL(tempUrl);
		}
	};

	const handleAddClick = useCallback(() => {
		if (myMediaItems.length >= maxClips) {
			toast.error(`Maximum ${maxClips} clips allowed`);
			return;
		}
		fileInputRef.current?.click();
	}, [myMediaItems.length, maxClips]);

	const handleDragStart = useCallback((item: MediaItem) => {
		currentDragItem = item;
	}, []);

	const handleDragEnd = useCallback(() => {
		currentDragItem = null;
	}, []);

	const remainingSlots = maxClips - myMediaItems.length;

	return (
		<div className="media-card-dock">
			<input ref={fileInputRef} type="file" accept={getAcceptAttribute()} multiple className="hidden" onChange={handleFileSelect} />

			<div className="media-card-dock__container">
				{myMediaItems.map((item, idx) => (
					<MediaCard
						key={item.id}
						item={item}
						index={idx}
						totalCards={myMediaItems.length + (remainingSlots > 0 ? 1 : 0)}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
					/>
				))}

				{remainingSlots > 0 && (
					<button onClick={handleAddClick} className="media-card-dock__add-button" title="Add media">
						<HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={2.5} />
					</button>
				)}
			</div>

			<div className="mt-2 text-[11px] font-medium pointer-events-auto bg-foreground px-3 py-1 rounded-xl backdrop-blur-sm">
				<span className={remainingSlots === 0 ? "text-red-400" : "text-primary-foreground/80"}>
					{myMediaItems.length} / {maxClips} clips
				</span>
			</div>
		</div>
	);
}
