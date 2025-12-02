"use client";

import { useState } from "react";
import { Clip } from "../types/timeline";

interface InspectorProps {
	selectedClips: { clip: Clip; trackId: string }[] | null;
}

export default function Inspector({ selectedClips }: InspectorProps) {
	const [activeTab, setActiveTab] = useState<string>("Video");

	const tabs = ["Video", "Audio", "Color", "Effects"];

	if (!selectedClips || selectedClips.length === 0) {
		return (
			<div className="h-full bg-[#1e1e1e] border-l border-zinc-800 flex items-center justify-center">
				<p className="text-sm text-zinc-500">No clip selected</p>
			</div>
		);
	}

	const { clip, trackId } = selectedClips[selectedClips.length - 1];

	return (
		<div className="h-full bg-[#1e1e1e] border-l border-zinc-800 flex flex-col">
			<div className="flex border-b border-zinc-800">
				{tabs.map((tab) => (
					<button
						key={tab}
						onClick={() => setActiveTab(tab)}
						className={`flex-1 px-4 py-2 text-sm ${
							activeTab === tab
								? "bg-[#2a2a2a] text-zinc-200 border-b-2 border-blue-500"
								: "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
						}`}
					>
						{tab}
					</button>
				))}
			</div>

			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				<div>
					<h3 className="text-xs font-semibold text-zinc-400 uppercase mb-2">Clip Info</h3>
					<div className="space-y-2 text-sm">
						<div className="flex justify-between">
							<span className="text-zinc-500">Type:</span>
							<span className="text-zinc-200 capitalize">{clip.type}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-zinc-500">Source:</span>
							<span className="text-zinc-200 truncate ml-2">{clip.src.split("/").pop()}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-zinc-500">Start Time:</span>
							<span className="text-zinc-200">{clip.startTime.toFixed(2)}s</span>
						</div>
						<div className="flex justify-between">
							<span className="text-zinc-500">Duration:</span>
							<span className="text-zinc-200">{clip.duration.toFixed(2)}s</span>
						</div>
						<div className="flex justify-between">
							<span className="text-zinc-500">End Time:</span>
							<span className="text-zinc-200">{(clip.startTime + clip.duration).toFixed(2)}s</span>
						</div>
					</div>
				</div>

				{clip.type === "video" && "properties" in clip && (
					<div>
						<h3 className="text-xs font-semibold text-zinc-400 uppercase mb-2">Transform</h3>
						<div className="space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-zinc-500">Position X:</span>
								<span className="text-zinc-200">{clip.properties.position.x}px</span>
							</div>
							<div className="flex justify-between">
								<span className="text-zinc-500">Position Y:</span>
								<span className="text-zinc-200">{clip.properties.position.y}px</span>
							</div>
							<div className="flex justify-between">
								<span className="text-zinc-500">Width:</span>
								<span className="text-zinc-200">{clip.properties.size.width}px</span>
							</div>
							<div className="flex justify-between">
								<span className="text-zinc-500">Height:</span>
								<span className="text-zinc-200">{clip.properties.size.height}px</span>
							</div>
						</div>
					</div>
				)}

				{clip.type === "audio" && "properties" in clip && (
					<div>
						<h3 className="text-xs font-semibold text-zinc-400 uppercase mb-2">Audio</h3>
						<div className="space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-zinc-500">Volume:</span>
								<span className="text-zinc-200">{(clip.properties.volume * 100).toFixed(0)}%</span>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
