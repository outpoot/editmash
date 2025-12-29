"use client";

import { useState, useCallback, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserGroupIcon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useRouter } from "next/navigation";
import { historyStore } from "../store/historyStore";
import { viewSettingsStore } from "../store/viewSettingsStore";
import { useTutorial } from "./Tutorial";

export interface ViewSettings {
	showShineEffect: boolean;
	showChat: boolean;
	showRemoteSelections: boolean;
	showRemoteClipNotifications: boolean;
}

interface TopBarProps {
	timeRemaining?: number | null;
	playersOnline?: number;
	onUndo?: () => void;
	onRedo?: () => void;
}

export default function TopBar({ timeRemaining, playersOnline, onUndo, onRedo }: TopBarProps) {
	const [activeMenu, setActiveMenu] = useState<string | null>(null);
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);
	const [viewSettings, setViewSettings] = useState<ViewSettings>(viewSettingsStore.getSettings());
	const router = useRouter();
	const { startTutorial, isAvailable: tutorialAvailable } = useTutorial();

	useEffect(() => {
		const updateHistoryState = () => {
			setCanUndo(historyStore.canUndo());
			setCanRedo(historyStore.canRedo());
		};

		updateHistoryState();
		const unsubscribe = historyStore.subscribe(updateHistoryState);
		return () => {
			unsubscribe();
		};
	}, []);

	useEffect(() => {
		const updateViewSettings = () => {
			setViewSettings(viewSettingsStore.getSettings());
		};

		const unsubscribe = viewSettingsStore.subscribe(updateViewSettings);
		return () => {
			unsubscribe();
		};
	}, []);



	const menuItems = ["EditMash", "File", "Edit", "View", "Help"];

	const handleMenuClick = useCallback(
		(item: string) => {
			if (item === "EditMash") {
				router.push("/");
			}
		},
		[router]
	);

	const toggleViewSetting = useCallback(
		(key: keyof ViewSettings) => {
			viewSettingsStore.updateSetting(key, !viewSettings[key]);
		},
		[viewSettings]
	);

	const getMenuContent = (
		item: string
	): Array<{
		label?: string;
		action?: () => void;
		type?: string;
		disabled?: boolean;
		shortcut?: string;
		checked?: boolean;
	}> | null => {
		switch (item) {
			case "File":
				return [{ label: "Leave match", action: () => router.push("/") }];
			case "Edit":
				return [
					{ label: "Undo", action: onUndo, disabled: !canUndo, shortcut: "Ctrl+Z" },
					{ label: "Redo", action: onRedo, disabled: !canRedo, shortcut: "Ctrl+Y" },
					{ type: "separator" },
					{ label: "Cut", shortcut: "Ctrl+X" },
					{ label: "Copy", shortcut: "Ctrl+C" },
					{ label: "Paste", shortcut: "Ctrl+V" },
					{ type: "separator" },
					{ label: "Delete", shortcut: "Del" },
					{ label: "Clear selection", shortcut: "Esc" },
					{ type: "separator" },
					{ label: "Select tool", shortcut: "A" },
					{ label: "Blade tool", shortcut: "B" },
					{ label: "Toggle snapping", shortcut: "N" },
					{ label: "Transform mode", shortcut: "T" },
					{ label: "Crop mode", shortcut: "C" },
					{ type: "separator" },
					{ label: "Play/Pause", shortcut: "Space" },
					{ label: "Focus chat", shortcut: "/" },
					{ type: "separator" },
					{ label: "Zoom in", shortcut: "Ctrl++" },
					{ label: "Zoom out", shortcut: "Ctrl+-" },
				];
			case "View":
				return [
					{
						label: "Shine on media card",
						type: "checkbox",
						checked: viewSettings.showShineEffect,
						action: () => toggleViewSetting("showShineEffect"),
					},
					{ label: "Chat", type: "checkbox", checked: viewSettings.showChat, action: () => toggleViewSetting("showChat") },
					{
						label: "Remote clip selections",
						type: "checkbox",
						checked: viewSettings.showRemoteSelections,
						action: () => toggleViewSetting("showRemoteSelections"),
					},
					{
						label: "Remote clip notifications",
						type: "checkbox",
						checked: viewSettings.showRemoteClipNotifications,
						action: () => toggleViewSetting("showRemoteClipNotifications"),
					},
				];
			case "Help":
				if (!tutorialAvailable) return null;
				return [
					{
						label: "Tutorial",
						action: () => {
							startTutorial();
							setActiveMenu(null);
						},
					},
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
									onClick={() => handleMenuClick(item)}
									onMouseEnter={() => activeMenu && setActiveMenu(item)}
									onMouseDown={() => {
										if (menuContent) {
											setActiveMenu(activeMenu === item ? null : item);
										}
									}}
									className={`px-3 py-1 transition-colors ${activeMenu === item ? "bg-accent" : "hover:bg-accent"} ${
										index === 0 ? "font-medium" : ""
									}`}
								>
									{item}
								</button>

								{activeMenu === item && menuContent && (
									<div
										className="absolute top-full left-0 mt-0.5 bg-popover border border-border rounded-md shadow-md min-w-[220px] p-1 z-50"
										onMouseLeave={() => setActiveMenu(null)}
									>
										{menuContent.map((menuItem, idx) => {
											if (menuItem.type === "separator") {
												return <div key={idx} className="-mx-1 my-1 h-px bg-muted" />;
											} else if (menuItem.type === "checkbox" && "checked" in menuItem) {
												return (
													<button
														key={idx}
														onClick={() => {
															menuItem.action?.();
														}}
														className="w-full text-left px-2 py-1.5 text-sm text-foreground hover:bg-accent rounded-sm transition-colors flex items-center gap-2"
													>
														<span className="w-3.5 h-3.5 flex items-center justify-center">
															{menuItem.checked && <HugeiconsIcon icon={Tick01Icon} size={16} />}
														</span>
														{menuItem.label}
													</button>
												);
											} else if ("label" in menuItem) {
												const isDisabled = "disabled" in menuItem && menuItem.disabled;
												return (
													<button
														key={idx}
														onClick={() => {
															if (!isDisabled) {
																menuItem.action?.();
																setActiveMenu(null);
															}
														}}
														disabled={isDisabled}
														className={`w-full text-left px-2 py-1.5 text-sm rounded-sm transition-colors flex items-center justify-between ${
															isDisabled ? "text-muted-foreground cursor-not-allowed" : "text-foreground hover:bg-accent"
														}`}
													>
														<span>{menuItem.label}</span>
														{"shortcut" in menuItem && menuItem.shortcut && (
															<span className="ml-auto text-xs tracking-widest opacity-60">{menuItem.shortcut}</span>
														)}
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
			</div>

			<div className="flex items-center gap-2">
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
