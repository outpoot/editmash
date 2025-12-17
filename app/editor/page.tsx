"use client";

import { useState, useRef, useEffect } from "react";
import TopBar from "../components/TopBar";
import MainLayout, { MainLayoutRef } from "../components/MainLayout";
import { TimelineState } from "../types/timeline";
import { mediaStore, MediaItem } from "../store/mediaStore";

interface SavedTimelineData {
	version: 1;
	savedAt: string;
	timelineState: TimelineState;
	mediaItems: MediaItem[];
	mediaBlobs: Record<string, string>;
}

export default function EditorPage() {
	const [showMedia, setShowMedia] = useState(true);
	const [showEffects, setShowEffects] = useState(false);
	const [isRendering, setIsRendering] = useState(false);
	const [renderJobId, setRenderJobId] = useState<string | null>(null);
	const [currentTimelineState, setCurrentTimelineState] = useState<TimelineState | null>(null);
	const [isImporting, setIsImporting] = useState(false);

	const mainLayoutRef = useRef<MainLayoutRef>(null);

	useEffect(() => {
		const savedTimeline = sessionStorage.getItem("importedTimeline");
		const savedMediaItems = sessionStorage.getItem("importedMediaItems");

		if (savedTimeline && savedMediaItems) {
			try {
				const timelineState: TimelineState = JSON.parse(savedTimeline);
				const mediaItems: MediaItem[] = JSON.parse(savedMediaItems);

				sessionStorage.removeItem("importedTimeline");
				sessionStorage.removeItem("importedMediaItems");

				mediaItems.forEach((item) => {
					mediaStore.addItem(item);
				});

				setTimeout(() => {
					mainLayoutRef.current?.loadTimeline(timelineState);
				}, 100);
			} catch (e) {
				console.error("Failed to restore timeline from sessionStorage:", e);
			}
		}
	}, []);

	const handleRender = async (timelineState: TimelineState) => {
		try {
			setIsRendering(true);

			const response = await fetch("/api/render", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ timelineState }),
			});

			if (!response.ok) {
				throw new Error(`Failed to submit render job: ${response.status}`);
			}

			const data = await response.json();
			setRenderJobId(data.jobId);

			const pollInterval = setInterval(async () => {
				const statusResponse = await fetch(`/api/render/${data.jobId}`);

				if (statusResponse.ok) {
					const statusData = await statusResponse.json();

					if (statusData.job.status === "completed") {
						clearInterval(pollInterval);
						setIsRendering(false);
						alert(`Render complete! Download: ${statusData.job.outputUrl}`);
					} else if (statusData.job.status === "failed") {
						clearInterval(pollInterval);
						setIsRendering(false);
						alert(`Render failed: ${statusData.job.error}`);
					}
				}
			}, 2000);
		} catch (error) {
			console.error("Render error:", error);
			setIsRendering(false);
			alert(`Failed to start render: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleSaveTimeline = async () => {
		if (!currentTimelineState) {
			alert("No timeline to save");
			return;
		}

		try {
			const mediaItems = mediaStore.getItems();
			const mediaBlobs: Record<string, string> = {};

			for (const item of mediaItems) {
				if (item.url && !item.url.startsWith("blob:")) {
					try {
						const response = await fetch(item.url);
						const blob = await response.blob();
						const base64 = await new Promise<string>((resolve) => {
							const reader = new FileReader();
							reader.onloadend = () => resolve(reader.result as string);
							reader.readAsDataURL(blob);
						});
						mediaBlobs[item.url] = base64;
					} catch (e) {
						console.warn(`Failed to fetch media for ${item.url}:`, e);
					}
				}
			}

			const saveData: SavedTimelineData = {
				version: 1,
				savedAt: new Date().toISOString(),
				timelineState: currentTimelineState,
				mediaItems: mediaItems.map((item) => ({
					...item,
					thumbnail: item.thumbnail?.startsWith("data:") ? item.thumbnail : undefined,
				})),
				mediaBlobs,
			};

			const json = JSON.stringify(saveData, null, 2);
			const blob = new Blob([json], { type: "application/json" });
			const url = URL.createObjectURL(blob);

			const a = document.createElement("a");
			a.href = url;
			a.download = `timeline-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Save error:", error);
			alert(`Failed to save timeline: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleImportTimeline = async (file: File) => {
		try {
			setIsImporting(true);
			const text = await file.text();
			const saveData: SavedTimelineData = JSON.parse(text);

			if (saveData.version !== 1) {
				throw new Error(`Unsupported timeline version: ${saveData.version}`);
			}

			mediaStore.cleanup();

			const urlMap: Record<string, string> = {};

			for (const item of saveData.mediaItems) {
				const base64Data = saveData.mediaBlobs[item.url];
				if (!base64Data) {
					console.warn(`No blob data for ${item.url}, skipping`);
					continue;
				}

				const response = await fetch(base64Data);
				const blob = await response.blob();

				const mediaFile = new File([blob], item.name, { type: blob.type });

				const formData = new FormData();
				formData.append("file", mediaFile);

				const uploadResponse = await fetch("/api/upload", {
					method: "POST",
					body: formData,
				});

				if (!uploadResponse.ok) {
					throw new Error(`Failed to upload ${item.name}: ${uploadResponse.status}`);
				}

				const uploadData = await uploadResponse.json();
				urlMap[item.url] = uploadData.url;

				mediaStore.addItem({
					...item,
					url: uploadData.url,
					fileId: uploadData.fileId,
					isUploading: false,
					uploadProgress: 100,
					uploadError: undefined,
				});
			}

			const updatedTimelineState: TimelineState = {
				...saveData.timelineState,
				tracks: saveData.timelineState.tracks.map((track) => ({
					...track,
					clips: track.clips.map((clip) => {
						const newUrl = urlMap[clip.src] || clip.src;
						return {
							...clip,
							src: newUrl,
						};
					}),
				})),
			};

			setCurrentTimelineState(updatedTimelineState);

			alert("Timeline imported successfully! The page will reload to apply changes.");

			sessionStorage.setItem("importedTimeline", JSON.stringify(updatedTimelineState));
			sessionStorage.setItem("importedMediaItems", JSON.stringify(mediaStore.getItems()));

			window.location.reload();
		} catch (error) {
			console.error("Import error:", error);
			alert(`Failed to import timeline: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<div className="h-screen flex flex-col">
			<TopBar
				showMedia={showMedia}
				showEffects={showEffects}
				onToggleMedia={() => setShowMedia(!showMedia)}
				onToggleEffects={() => setShowEffects(!showEffects)}
				onRender={() => {
					if (currentTimelineState) {
						handleRender(currentTimelineState);
					} else {
						alert("No timeline to render");
					}
				}}
				onSaveTimeline={handleSaveTimeline}
				onImportTimeline={handleImportTimeline}
			/>
			<MainLayout ref={mainLayoutRef} showMedia={showMedia} showEffects={showEffects} onTimelineStateChange={setCurrentTimelineState} />

			{isRendering && (
				<div className="fixed inset-0 bg-background/50 flex items-center justify-center z-[100]">
					<div className="bg-card border border-border rounded-lg p-6 min-w-[300px]">
						<h3 className="text-foreground text-lg mb-4">Rendering Video...</h3>
						<div className="w-full h-2 bg-muted rounded overflow-hidden">
							<div className="h-full bg-primary animate-pulse" style={{ width: "100%" }} />
						</div>
						<p className="text-muted-foreground text-sm mt-2">Job ID: {renderJobId}</p>
					</div>
				</div>
			)}

			{isImporting && (
				<div className="fixed inset-0 bg-background/50 flex items-center justify-center z-[100]">
					<div className="bg-card border border-border rounded-lg p-6 min-w-[300px]">
						<h3 className="text-foreground text-lg mb-4">Importing Timeline...</h3>
						<div className="w-full h-2 bg-muted rounded overflow-hidden">
							<div className="h-full bg-chart-5 animate-pulse" style={{ width: "100%" }} />
						</div>
						<p className="text-muted-foreground text-sm mt-2">Re-uploading media files to B2...</p>
					</div>
				</div>
			)}
		</div>
	);
}
