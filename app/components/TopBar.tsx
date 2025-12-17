"use client";

import { useState, useRef } from "react";
import { Check, Video, Download, Upload, Users } from "lucide-react";

interface TopBarProps {
	showMedia: boolean;
	showEffects: boolean;
	onToggleMedia: () => void;
	onToggleEffects: () => void;
	onRender?: () => void;
	onSaveTimeline?: () => void;
	onImportTimeline?: (file: File) => void;
	timeRemaining?: number | null;
	matchInfo?: { playerCount: number };
}

export default function TopBar({
	showMedia,
	showEffects,
	onToggleMedia,
	onToggleEffects,
	onRender,
	onSaveTimeline,
	onImportTimeline,
	timeRemaining,
	matchInfo,
}: TopBarProps) {
	const [activeMenu, setActiveMenu] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const isDev = process.env.NODE_ENV === "development";

	const menuItems = ["EditMash", "File", "Edit", "View", "Playback", "Help"];

	const getMenuContent = (item: string) => {
		switch (item) {
			case "View":
				return [
					{ label: "Media Pool", action: onToggleMedia, checked: showMedia, type: "checkbox" },
					{ label: "Effects Library", action: onToggleEffects, checked: showEffects, type: "checkbox" },
				];
			case "File":
				return [
					{ label: "New Project", action: () => {} },
					{ label: "Open Project...", action: () => {} },
					{ label: "Save Project", action: () => {} },
					{ type: "separator" },
					{ label: "Import Media...", action: () => {} },
					{ label: "Export", action: () => {} },
				];
			case "Edit":
				return [
					{ label: "Undo", action: () => {} },
					{ label: "Redo", action: () => {} },
					{ type: "separator" },
					{ label: "Cut", action: () => {} },
					{ label: "Copy", action: () => {} },
					{ label: "Paste", action: () => {} },
				];
			default:
				return null;
		}
	};

	return (
		<div className="fixed top-0 left-0 right-0 z-50 flex h-8 items-center justify-between bg-background px-2 text-[13px] text-foreground select-none border-b border-border">
			<div className="flex items-center gap-4 relative">
				<div className="flex items-center relative">
					{menuItems.map((item, index) => {
						const menuContent = getMenuContent(item);
						return (
							<div key={item} className="relative">
								<button
									onMouseEnter={() => setActiveMenu(item)}
									className={`px-3 py-1 transition-colors ${activeMenu === item ? "bg-accent" : "hover:bg-accent"} ${
										index === 0 ? "font-medium" : ""
									}`}
								>
									{item}
								</button>

								{activeMenu === item && menuContent && (
									<div
										className="absolute top-full left-0 mt-0 bg-popover border border-border rounded shadow-lg min-w-[180px] py-1 z-50"
										onMouseEnter={() => setActiveMenu(item)}
										onMouseLeave={() => setActiveMenu(null)}
									>
										{menuContent.map((menuItem, idx) => {
											if (menuItem.type === "separator") {
												return <div key={idx} className="h-px bg-border my-1" />;
											} else if (menuItem.type === "checkbox" && "checked" in menuItem) {
												return (
													<button
														key={idx}
														onClick={() => {
															menuItem.action?.();
														}}
														className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-2"
													>
														<span className="w-3 h-3 border border-muted-foreground rounded-sm flex items-center justify-center">
															{menuItem.checked && <Check size={10} strokeWidth={2} />}
														</span>
														{menuItem.label}
													</button>
												);
											} else if ("label" in menuItem) {
												return (
													<button
														key={idx}
														onClick={() => {
															menuItem.action?.();
															setActiveMenu(null);
														}}
														className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
													>
														{menuItem.label}
													</button>
												);
											}
											return null;
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>

				{onRender && (
					<button
						onClick={onRender}
						className="flex items-center gap-1.5 px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors text-xs font-medium"
					>
						<Video size={14} />
						Render
					</button>
				)}

				{isDev && onSaveTimeline && (
					<button
						onClick={onSaveTimeline}
						className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors text-xs font-medium"
						title="Save timeline state as JSON (dev only)"
					>
						<Download size={14} />
						Save Timeline
					</button>
				)}

				{isDev && onImportTimeline && (
					<>
						<input
							ref={fileInputRef}
							type="file"
							accept=".json"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) {
									onImportTimeline(file);
									e.target.value = "";
								}
							}}
						/>
						<button
							onClick={() => fileInputRef.current?.click()}
							className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors text-xs font-medium"
							title="Import timeline from JSON (dev only)"
						>
							<Upload size={14} />
							Import Timeline
						</button>
					</>
				)}
			</div>

			<div className="flex items-center gap-2">
				{matchInfo && (
					<div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded text-xs text-muted-foreground">
						<Users size={12} />
						{matchInfo.playerCount}
					</div>
				)}

				{timeRemaining !== null && timeRemaining !== undefined && (
					<div
						className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold ${
							timeRemaining <= 10 ? "bg-red-600 text-white" : "bg-red-600/80 text-white"
						}`}
					>
						{Math.floor(timeRemaining / 60)}:{String(Math.floor(timeRemaining % 60)).padStart(2, "0")}
					</div>
				)}
			</div>

			{/* rightside window controls but idk if i wanna keep them so commented for now */}

			{/* <div className="flex items-center">
                <button className="flex h-12 w-14 items-center justify-center hover:bg-zinc-700/50 transition-colors">
                    <svg width="12" height="2" viewBox="0 0 12 2" fill="none">
                        <rect width="12" height="2" fill="currentColor" />
                    </svg>
                </button>
                <button className="flex h-12 w-14 items-center justify-center hover:bg-zinc-700/50 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect
                            x="0.5"
                            y="0.5"
                            width="11"
                            height="11"
                            stroke="currentColor"
                            strokeWidth="1"
                        />
                    </svg>
                </button>
                <button className="flex h-12 w-14 items-center justify-center hover:bg-red-600 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path
                            d="M2 2L10 10M10 2L2 10"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                        />
                    </svg>
                </button>
            </div> */}
		</div>
	);
}
