"use client";

import { useState } from "react";
import TopBar from "./components/TopBar";
import MainLayout from "./components/MainLayout";
import { TimelineState } from "./types/timeline";

// note: there's a memory leak here, since polling interval is not cleared on unmount, but this has to be replaced soon anyway
export default function Home() {
	const [showMedia, setShowMedia] = useState(true);
	const [showEffects, setShowEffects] = useState(false);
	const [isRendering, setIsRendering] = useState(false);
	const [renderJobId, setRenderJobId] = useState<string | null>(null);
	const [currentTimelineState, setCurrentTimelineState] = useState<TimelineState | null>(null);

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

	return (
		<>
			<script crossOrigin="anonymous" src="//unpkg.com/react-scan/dist/auto.global.js"></script>
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
			/>
			<MainLayout showMedia={showMedia} showEffects={showEffects} onTimelineStateChange={setCurrentTimelineState} />

			{isRendering && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
					<div className="bg-[#1a1a1a] border border-zinc-700 rounded-lg p-6 min-w-[300px]">
						<h3 className="text-white text-lg mb-4">Rendering Video...</h3>
						<div className="w-full h-2 bg-zinc-700 rounded overflow-hidden">
							<div className="h-full bg-blue-600 animate-pulse" style={{ width: "100%" }} />
						</div>
						<p className="text-zinc-400 text-sm mt-2">Job ID: {renderJobId}</p>
					</div>
				</div>
			)}
		</>
	);
}
