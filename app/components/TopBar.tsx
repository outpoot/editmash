"use client";

import { useState, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick01Icon, Download01Icon, Upload01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";

interface TopBarProps {
	showEffects: boolean;
	onToggleEffects: () => void;
	onSaveTimeline?: () => void;
	onImportTimeline?: (file: File) => void;
	timeRemaining?: number | null;
	playersOnline?: number;
	playerClipCount?: number;
	maxClipsPerUser?: number;
}

export default function TopBar({
	showEffects,
	onToggleEffects,
	onSaveTimeline,
	onImportTimeline,
	timeRemaining,
	playersOnline,
	playerClipCount,
	maxClipsPerUser,
}: TopBarProps) {
	const [activeMenu, setActiveMenu] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const isDev = process.env.NODE_ENV === "development";

	const menuItems = ["EditMash", "File", "Edit", "View", "Playback", "Help"];

	const getMenuContent = (item: string) => {
		switch (item) {
			case "View":
				return [{ label: "Effects Library", action: onToggleEffects, checked: showEffects, type: "checkbox" }];
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
															{menuItem.checked && <HugeiconsIcon icon={Tick01Icon} size={10} strokeWidth={2} />}
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

				{isDev && onSaveTimeline && (
					<button
						onClick={onSaveTimeline}
						className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors text-xs font-medium"
						title="Save timeline state as JSON (dev only)"
					>
						<HugeiconsIcon icon={Download01Icon} size={14} />
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
							<HugeiconsIcon icon={Upload01Icon} size={14} />
							Import Timeline
						</button>
					</>
				)}
			</div>

			<div className="flex items-center gap-2">
				{playerClipCount !== undefined && maxClipsPerUser !== undefined && maxClipsPerUser > 0 && (
					<div
						className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
							playerClipCount >= maxClipsPerUser
								? "bg-red-600/20 text-red-400 border border-red-600/40"
								: playerClipCount >= maxClipsPerUser * 0.8
								? "bg-amber-600/20 text-amber-400 border border-amber-600/40"
								: "bg-muted text-muted-foreground"
						}`}
						title={
							playerClipCount >= maxClipsPerUser
								? "You've reached the maximum clip limit"
								: `${maxClipsPerUser - playerClipCount} clips remaining`
						}
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<rect x="2" y="2" width="20" height="20" rx="2" ry="2" />
							<line x1="2" y1="12" x2="22" y2="12" />
							<line x1="12" y1="2" x2="12" y2="22" />
						</svg>
						{playerClipCount}/{maxClipsPerUser}
					</div>
				)}

				{playersOnline !== undefined && (
					<div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded text-xs text-muted-foreground">
						<HugeiconsIcon icon={UserGroupIcon} size={12} />
						{playersOnline}
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
		</div>
	);
}
