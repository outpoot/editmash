"use client";

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import MediaCard from "./MediaCard";
import { mediaStore, MediaItem, generateThumbnail, DEFAULT_IMAGE_DURATION } from "../store/mediaStore";
import { validateFile, getAcceptAttribute } from "@/lib/validation";
import { toast } from "sonner";
import { useMatchWebSocketOptional } from "./MatchWS";
import { videoHasAudio, extractAudioFromVideo } from "@/lib/audioExtraction";

interface MediaCardDockProps {
	maxClips?: number;
}

export interface MediaCardDockRef {
	handleExternalDrop: (files: FileList) => void;
}

let currentDragItem: MediaItem | null = null;

export function getCurrentDragItem() {
	return currentDragItem;
}

const UNLIMITED_CLIPS = 0;

const MediaCardDock = forwardRef<MediaCardDockRef, MediaCardDockProps>(({ maxClips = 10 }, ref) => {
	const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const matchWs = useMatchWebSocketOptional();

	const isUnlimited = maxClips === UNLIMITED_CLIPS;
	const myMediaItems = mediaItems.filter((item) => !item.isRemote);
	const successfulMediaCount = myMediaItems.filter((item) => !item.uploadError).length;

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

			if (type === "video") {
				const hasAudio = await videoHasAudio(file);

				if (hasAudio) {
					const currentCount = mediaStore.getItems().filter((item) => !item.isRemote && !item.uploadError).length;
					const wouldExceedLimit = !isUnlimited && currentCount >= maxClips;

					if (wouldExceedLimit) {
						toast.warning("Cannot split video with audio", {
							description: `Would exceed ${maxClips} clip limit. Remove a clip first.`,
							duration: 5000,
						});
						return;
					}

					toast("This video has audio", {
						description: "Split into separate video and audio? (Counts as 2 media cards)",
						duration: 5000,
						action: {
							label: "Split",
							onClick: async () => {
								const splitToastId = toast.loading("Extracting audio...", {
									description: file.name,
								});

								try {
									const audioBlob = await extractAudioFromVideo(file);
									if (!audioBlob) {
										toast.dismiss(splitToastId);
										toast.error("Failed to extract audio", {
											description: file.name,
										});
										return;
									}

									const audioFileName = file.name.replace(/\.[^/.]+$/, "") + "_audio.wav";
									const audioFile = new File([audioBlob], audioFileName, { type: "audio/wav" });
									const audioTempUrl = URL.createObjectURL(audioBlob);
									const audioItemId = `${Date.now()}-${Math.random()}`;

									const audioElement = document.createElement("audio");
									audioElement.src = audioTempUrl;

									audioElement.addEventListener("loadedmetadata", async () => {
										const audioMediaItem: MediaItem = {
											id: audioItemId,
											name: audioFileName,
											type: "audio",
											url: audioTempUrl,
											duration: audioElement.duration,
											isUploading: true,
										};

										mediaStore.addItem(audioMediaItem);

										try {
											const audioFormData = new FormData();
											audioFormData.append("file", audioFile);

											const audioXhr = new XMLHttpRequest();

											audioXhr.upload.addEventListener("progress", (e) => {
												if (e.lengthComputable) {
													const progress = Math.round((e.loaded / e.total) * 100);
													mediaStore.updateItem(audioItemId, { uploadProgress: progress });
												}
											});

											const audioUploadPromise = new Promise<{ url: string; fileId: string }>((resolve, reject) => {
												audioXhr.addEventListener("load", () => {
													if (audioXhr.status >= 200 && audioXhr.status < 300) {
														resolve(JSON.parse(audioXhr.responseText));
													} else {
														reject(new Error(`Upload failed: ${audioXhr.status}`));
													}
												});
												audioXhr.addEventListener("error", () => reject(new Error("Network error")));
												audioXhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

												audioXhr.open("POST", "/api/upload");
												audioXhr.send(audioFormData);
											});

											const audioData = await audioUploadPromise;

											mediaStore.updateItem(audioItemId, {
												url: audioData.url,
												fileId: audioData.fileId,
												isUploading: false,
												uploadProgress: 100,
											});

											const audioDbId = await saveMediaToDatabase(audioItemId, audioFileName, "audio", audioData.url, audioData.fileId);
											if (!audioDbId) {
												toast.warning("Audio uploaded but may not persist after refresh", {
													description: audioFileName,
												});
											} else if (matchWs?.status === "connected") {
												const updatedAudioItem = mediaStore.getItemById(audioDbId);
												if (updatedAudioItem) {
													matchWs.broadcastMediaUploaded({ ...updatedAudioItem, url: audioData.url, fileId: audioData.fileId });
												}
											}

											toast.dismiss(splitToastId);
											toast.success("Audio extracted successfully", {
												description: audioFileName,
											});

											URL.revokeObjectURL(audioTempUrl);
										} catch (error) {
											console.error("Error uploading extracted audio:", error);
											toast.dismiss(splitToastId);
											toast.error("Failed to upload extracted audio", {
												description: error instanceof Error ? error.message : "Upload failed",
											});
											mediaStore.updateItem(audioItemId, {
												isUploading: false,
												uploadError: error instanceof Error ? error.message : "Upload failed",
											});
											URL.revokeObjectURL(audioTempUrl);
										}
									});

									audioElement.addEventListener("error", () => {
										toast.dismiss(splitToastId);
										toast.error("Failed to process extracted audio", {
											description: file.name,
										});
										URL.revokeObjectURL(audioTempUrl);
									});
								} catch (error) {
									toast.dismiss(splitToastId);
									toast.error("Failed to extract audio", {
										description: error instanceof Error ? error.message : "Unknown error",
									});
								}
							},
						},
					});
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

	const processFile = async (file: File) => {
		const validation = validateFile({
			name: file.name,
			size: file.size,
			type: file.type,
		});

		if (!validation.valid) {
			toast.error(validation.message || "Invalid file", { description: file.name });
			return;
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
			return;
		}

		const element = type === "video" ? document.createElement("video") : document.createElement("audio");
		element.src = tempUrl;
		element.preload = "metadata";

		element.addEventListener("error", () => {
			URL.revokeObjectURL(tempUrl);
			toast.error("Failed to load media", { description: file.name });
		});

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
	};

	const handleFileSelect = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			if (!files) return;

			const currentCount = successfulMediaCount;

			let filesToProcess: File[];
			if (isUnlimited) {
				filesToProcess = Array.from(files);
			} else {
				const remainingSlots = maxClips - currentCount;

				if (remainingSlots <= 0) {
					toast.error(`Maximum ${maxClips} clips allowed`);
					return;
				}

				filesToProcess = Array.from(files).slice(0, remainingSlots);

				if (files.length > remainingSlots) {
					toast.warning(`Only ${remainingSlots} more clip${remainingSlots === 1 ? "" : "s"} allowed. Some files were not imported.`);
				}
			}

			for (const file of filesToProcess) {
				await processFile(file);
			}

			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		},
		[successfulMediaCount, maxClips, isUnlimited]
	);

	const handleAddClick = useCallback(() => {
		if (!isUnlimited && successfulMediaCount >= maxClips) {
			toast.error(`Maximum ${maxClips} clips allowed`);
			return;
		}
		fileInputRef.current?.click();
	}, [successfulMediaCount, maxClips, isUnlimited]);

	const handleDragStart = useCallback((item: MediaItem) => {
		currentDragItem = item;
	}, []);

	const handleDragEnd = useCallback(() => {
		currentDragItem = null;
	}, []);

	const processFilesFromDrop = useCallback(
		async (files: FileList) => {
			const currentCount = successfulMediaCount;

			let filesToProcess: File[];
			if (isUnlimited) {
				filesToProcess = Array.from(files);
			} else {
				const remainingSlots = maxClips - currentCount;

				if (remainingSlots <= 0) {
					toast.error(`Maximum ${maxClips} clips allowed`);
					return;
				}

				filesToProcess = Array.from(files).slice(0, remainingSlots);

				if (files.length > remainingSlots) {
					toast.warning(`Only ${remainingSlots} more clip${remainingSlots === 1 ? "" : "s"} allowed. Some files were not imported.`);
				}
			}

			for (const file of filesToProcess) {
				await processFile(file);
			}
		},
		[successfulMediaCount, maxClips, isUnlimited, processFile]
	);

	useImperativeHandle(
		ref,
		() => ({
			handleExternalDrop: processFilesFromDrop,
		}),
		[processFilesFromDrop]
	);

	const remainingSlots = isUnlimited ? Infinity : maxClips - successfulMediaCount;
	const showAddButton = remainingSlots > 0;

	return (
		<div className="media-card-dock">
			<input ref={fileInputRef} type="file" accept={getAcceptAttribute()} multiple className="hidden" onChange={handleFileSelect} />

			<div className="media-card-dock__container">
				{myMediaItems.map((item, idx) => (
					<MediaCard
						key={item.id}
						item={item}
						index={idx}
						totalCards={myMediaItems.length + (showAddButton ? 1 : 0)}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
					/>
				))}

				{showAddButton && (
					<button onClick={handleAddClick} className="media-card-dock__add-button" title="Add media">
						<HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={2.5} />
					</button>
				)}
			</div>

			<div className="mt-2 text-[11px] font-medium pointer-events-auto bg-foreground px-3 py-1 rounded-xl backdrop-blur-sm">
				<span className={!isUnlimited && remainingSlots === 0 ? "text-red-400" : "text-primary-foreground/80"}>
					{isUnlimited ? `${successfulMediaCount} clips` : `${successfulMediaCount} / ${maxClips} clips`}
				</span>
			</div>
		</div>
	);
});

MediaCardDock.displayName = "MediaCardDock";

export default MediaCardDock;
