"use client";

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowRight01Icon,
	ArrowLeft01Icon,
	Cancel01Icon,
	PlayIcon,
	UserGroupIcon,
	Clock01Icon,
	VideoIcon,
	MusicNote01Icon,
	Cursor01Icon,
	ScissorIcon,
	MessageMultiple01Icon,
	Add01Icon,
} from "@hugeicons/core-free-icons";

interface TutorialStep {
	id: string;
	title: string;
	description: string;
	targetSelector?: string;
	position: "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
	highlightPadding?: number;
	highlightBorderRadius?: number;
	scrollIntoView?: boolean;
	activateChat?: boolean;
	showPlaceholderImage?: boolean;
}

const tutorialSteps: TutorialStep[] = [
	{
		id: "welcome",
		title: "Welcome to EditMash! 🙂",
		description:
			"EditMash is a multiplayer collaborative video editor where hundreds of players join timed matches to create chaotic, entertaining videos together. Let's show you how it works!",
		position: "center",
	},
	{
		id: "timer",
		title: "Timer",
		description:
			"Each match has a time limit. When you join a match, you'll see a countdown timer here. Work fast - when time runs out, the video is rendered and uploaded to Library!",
		targetSelector: '[class*="bg-red-600"]',
		position: "bottom-left",
		highlightPadding: 8,
		highlightBorderRadius: 8,
	},
	{
		id: "players",
		title: "Playercount",
		description:
			"This shows how many players are currently editing the same video with you. It could be two, dozens, or even hundreds of people all working on the same timeline!",
		targetSelector: '[class*="bg-muted"][class*="rounded"][class*="text-xs"]',
		position: "bottom-left",
		highlightPadding: 8,
		highlightBorderRadius: 8,
	},
	{
		id: "media-dock",
		title: "Media",
		description:
			"Upload your video, audio, and image files here. Click the + button to add files. Each match has a limit on how many clips each player can add, so choose wisely!",
		targetSelector: ".media-card-dock",
		position: "top",
		highlightPadding: 12,
		highlightBorderRadius: 16,
	},
	{
		id: "timeline",
		title: "Timeline",
		description:
			"This is where the magic happens! The timeline shows all video and audio tracks. Everyone in the match can add, move, and edit clips here simultaneously. You'll see other players' changes in real-time!",
		targetSelector: "[data-tutorial='timeline']",
		position: "top",
		highlightPadding: 8,
		highlightBorderRadius: 8,
	},
	{
		id: "video-tracks",
		title: "Video Tracks",
		description:
			"Video tracks (marked with V) hold your video and image clips. Higher tracks appear on top - layer clips to create picture-in-picture effects or overlays!",
		targetSelector: "[data-tutorial='video-track']",
		position: "right",
		highlightPadding: 4,
		highlightBorderRadius: 4,
		scrollIntoView: true,
	},
	{
		id: "audio-tracks",
		title: "Audio Tracks",
		description:
			"Audio tracks (marked with A) hold music, sound effects, and other audio. Adjust volume for each clip in the Inspector panel.",
		targetSelector: "[data-tutorial='audio-track']",
		position: "right",
		highlightPadding: 4,
		highlightBorderRadius: 4,
		scrollIntoView: true,
	},
	{
		id: "preview",
		title: "Preview",
		description:
			"Preview your collaborative creation in real-time. Press Space to play/pause. What you see here is what gets rendered when the match ends!",
		targetSelector: "canvas",
		position: "right",
		highlightPadding: 12,
		highlightBorderRadius: 8,
	},
	{
		id: "inspector",
		title: "Inspector",
		description:
			"Select a clip and adjust its properties here - position, size, rotation, crop, and more. For audio clips, you can adjust the volume.",
		targetSelector: "[data-tutorial='inspector']",
		position: "left",
		highlightPadding: 8,
		highlightBorderRadius: 8,
	},
	{
		id: "tools",
		title: "Tools",
		description:
			"Use different tools for different tasks:\n• Select Tool (A) - Move and select clips\n• Blade Tool (B) - Split clips at the cursor\n• Snap Mode (N) - Clips snap to each other",
		targetSelector: "[data-tutorial='toolbar']",
		position: "bottom",
		highlightPadding: 8,
		highlightBorderRadius: 8,
	},
	{
		id: "chat",
		title: "Chat",
		description:
			"Coordinate with other players using the chat! Press / to focus the chat input. Collaborate, strategize, or just have fun with everyone editing together.",
		targetSelector: "[data-tutorial='chat']",
		position: "top-right",
		highlightPadding: 12,
		highlightBorderRadius: 12,
		activateChat: true,
	},
	{
		id: "remote-selections",
		title: "Highlights",
		description:
			"Colored outlines on clips show what other players have selected. Each player has a unique color, you can change yours in Settings!",
		targetSelector: "[data-tutorial='timeline']",
		position: "top",
		highlightPadding: 8,
		highlightBorderRadius: 8,
		showPlaceholderImage: true,
	},
	{
		id: "match-end",
		title: "End",
		description:
			"When the match timer hits zero, editing stops! The final video is automatically rendered and uploaded to Library. Everyone can watch the collaborative masterpiece!",
		position: "center",
	},
	{
		id: "ready",
		title: "Ready!",
		description:
			"That's everything you need to know! Jump into a match, upload some media, and start creating with players from around the world. Have fun and make something amazing (or hilariously chaotic)!",
		position: "center",
	},
];

interface TutorialContextType {
	isOpen: boolean;
	startTutorial: () => void;
	endTutorial: () => void;
	isAvailable: boolean;
}

const TutorialContext = createContext<TutorialContextType>({
	isOpen: false,
	startTutorial: () => {},
	endTutorial: () => {},
	isAvailable: false,
});

export function useTutorial() {
	return useContext(TutorialContext);
}

interface TutorialProviderProps {
	children: ReactNode;
	tutorialCompleted?: boolean;
	onTutorialComplete?: () => void;
}

export function TutorialProvider({ children, tutorialCompleted, onTutorialComplete }: TutorialProviderProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [hasAutoStarted, setHasAutoStarted] = useState(false);

	useEffect(() => {
		if (tutorialCompleted === false && !hasAutoStarted) {
			setIsOpen(true);
			setHasAutoStarted(true);
		}
	}, [tutorialCompleted, hasAutoStarted]);

	const startTutorial = useCallback(() => {
		setIsOpen(true);
	}, []);

	const endTutorial = useCallback(() => {
		setIsOpen(false);
		if (tutorialCompleted === false && onTutorialComplete) {
			onTutorialComplete();
		}
	}, [tutorialCompleted, onTutorialComplete]);

	return (
		<TutorialContext.Provider value={{ isOpen, startTutorial, endTutorial, isAvailable: true }}>
			{children}
			{isOpen && <TutorialOverlay onClose={endTutorial} />}
		</TutorialContext.Provider>
	);
}

interface TutorialOverlayProps {
	onClose: () => void;
}

function TutorialOverlay({ onClose }: TutorialOverlayProps) {
	const [currentStep, setCurrentStep] = useState(0);
	const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
	const [chatWasActivated, setChatWasActivated] = useState(false);

	const step = tutorialSteps[currentStep];
	const isFirstStep = currentStep === 0;
	const isLastStep = currentStep === tutorialSteps.length - 1;

	const findAndHighlightElement = useCallback(() => {
		if (!step.targetSelector) {
			setHighlightRect(null);
			return;
		}

		const isTrackElement =
			step.targetSelector.includes("data-tutorial='video-track'") || step.targetSelector.includes("data-tutorial='audio-track'");

		if (isTrackElement) {
			const scrollContainer = document.querySelector("[data-tutorial='timeline']")?.querySelector(".overflow-auto") as HTMLElement;
			const trackNamesColumn = document.querySelector("[data-tutorial='timeline'] .w-32");

			if (!scrollContainer || !trackNamesColumn) {
				setHighlightRect(null);
				return;
			}

			const trackHeight = 40;
			const rulerHeight = 32;
			const isVideoTrack = step.targetSelector.includes("video-track");

			const allTrackElements = document.querySelectorAll("[data-tutorial='video-track'], [data-tutorial='audio-track']");
			let targetIndex = -1;

			if (isVideoTrack) {
				allTrackElements.forEach((el, idx) => {
					if (targetIndex === -1 && el.getAttribute("data-tutorial") === "video-track") {
						targetIndex = idx;
					}
				});
			} else {
				allTrackElements.forEach((el, idx) => {
					if (targetIndex === -1 && el.getAttribute("data-tutorial") === "audio-track") {
						targetIndex = idx;
					}
				});
			}

			if (targetIndex === -1) {
				setHighlightRect(null);
				return;
			}

			scrollContainer.scrollTo({ top: 0, behavior: "instant" });

			const targetScrollTop = targetIndex * trackHeight;
			const containerHeight = scrollContainer.clientHeight - rulerHeight;
			const scrollTo = Math.max(0, targetScrollTop - containerHeight / 2 + trackHeight / 2);

			scrollContainer.scrollTo({ top: scrollTo, behavior: "instant" });

			requestAnimationFrame(() => {
				const containerRect = trackNamesColumn.getBoundingClientRect();
				const currentScrollTop = scrollContainer.scrollTop;

				const visualTop = containerRect.top + rulerHeight + targetIndex * trackHeight - currentScrollTop;

				setHighlightRect(new DOMRect(containerRect.left, visualTop, containerRect.width, trackHeight));
			});

			return;
		}

		const element = document.querySelector(step.targetSelector);
		if (element) {
			let scrollDelay = 0;

			if (step.scrollIntoView) {
				const scrollContainer = document.querySelector("[data-tutorial='timeline']")?.querySelector(".overflow-auto");
				if (scrollContainer) {
					const containerRect = scrollContainer.getBoundingClientRect();
					const elementRect = element.getBoundingClientRect();

					const targetScrollTop = Math.max(
						0,
						element.getBoundingClientRect().top -
							containerRect.top +
							scrollContainer.scrollTop -
							containerRect.height / 2 +
							elementRect.height / 2
					);

					const scrollDistance = Math.abs(scrollContainer.scrollTop - targetScrollTop);
					scrollDelay = Math.min(600, Math.max(400, scrollDistance * 2));

					scrollContainer.scrollTo({ top: targetScrollTop, behavior: "smooth" });
				}
			}

			setTimeout(() => {
				const rect = element.getBoundingClientRect();
				setHighlightRect(rect);
			}, scrollDelay);
		} else {
			setHighlightRect(null);
		}
	}, [step.targetSelector, step.scrollIntoView]);

	useEffect(() => {
		if (step.activateChat) {
			const chatInput = document.querySelector("[data-tutorial='chat'] input") as HTMLInputElement;
			if (chatInput) {
				chatInput.focus();
				setChatWasActivated(true);
			}
		} else if (chatWasActivated) {
			const chatInput = document.querySelector("[data-tutorial='chat'] input") as HTMLInputElement;
			if (chatInput) {
				chatInput.blur();
			}
			setChatWasActivated(false);
		}
	}, [step.activateChat, chatWasActivated]);

	useEffect(() => {
		findAndHighlightElement();

		const resizeObserver = new ResizeObserver(findAndHighlightElement);
		resizeObserver.observe(document.body);

		window.addEventListener("resize", findAndHighlightElement);
		window.addEventListener("scroll", findAndHighlightElement);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", findAndHighlightElement);
			window.removeEventListener("scroll", findAndHighlightElement);
		};
	}, [currentStep, findAndHighlightElement]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "ArrowRight" || e.key === "Enter") {
				if (!isLastStep) {
					setCurrentStep((prev) => prev + 1);
				} else {
					onClose();
				}
			} else if (e.key === "ArrowLeft") {
				if (!isFirstStep) {
					setCurrentStep((prev) => prev - 1);
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isFirstStep, isLastStep, onClose]);

	const handleNext = () => {
		if (!isLastStep) {
			setCurrentStep((prev) => prev + 1);
		} else {
			onClose();
		}
	};

	const handlePrev = () => {
		if (!isFirstStep) {
			setCurrentStep((prev) => prev - 1);
		}
	};

	const getTooltipPosition = (): React.CSSProperties => {
		const padding = step.highlightPadding ?? 8;

		if (!highlightRect || step.position === "center") {
			return {
				position: "fixed",
				top: "50%",
				left: "50%",
				transform: "translate(-50%, -50%)",
			};
		}

		const tooltipWidth = 380;
		const tooltipHeight = 250;
		const margin = 20;

		let top: number;
		let left: number;

		switch (step.position) {
			case "top":
				top = highlightRect.top - padding - tooltipHeight - margin;
				left = highlightRect.left + highlightRect.width / 2 - tooltipWidth / 2;
				break;
			case "bottom":
				top = highlightRect.bottom + padding + margin;
				left = highlightRect.left + highlightRect.width / 2 - tooltipWidth / 2;
				break;
			case "left":
				top = highlightRect.top + highlightRect.height / 2 - tooltipHeight / 2;
				left = highlightRect.left - padding - tooltipWidth - margin;
				break;
			case "right":
				top = highlightRect.top + highlightRect.height / 2 - tooltipHeight / 2;
				left = highlightRect.right + padding + margin;
				break;
			case "top-left":
				top = highlightRect.top - padding - tooltipHeight - margin;
				left = highlightRect.left - padding;
				break;
			case "top-right":
				top = highlightRect.top - padding - tooltipHeight - margin;
				left = highlightRect.right + padding - tooltipWidth;
				break;
			case "bottom-left":
				top = highlightRect.bottom + padding + margin;
				left = highlightRect.left - padding;
				break;
			case "bottom-right":
				top = highlightRect.bottom + padding + margin;
				left = highlightRect.right + padding - tooltipWidth;
				break;
			default:
				top = highlightRect.bottom + padding + margin;
				left = highlightRect.left + highlightRect.width / 2 - tooltipWidth / 2;
		}

		top = Math.max(margin, Math.min(top, window.innerHeight - tooltipHeight - margin));
		left = Math.max(margin, Math.min(left, window.innerWidth - tooltipWidth - margin));

		return {
			position: "fixed",
			top: `${top}px`,
			left: `${left}px`,
		};
	};

	const getStepIcon = (stepId: string) => {
		switch (stepId) {
			case "welcome":
				return PlayIcon;
			case "timer":
				return Clock01Icon;
			case "players":
				return UserGroupIcon;
			case "media-dock":
				return Add01Icon;
			case "timeline":
			case "video-tracks":
				return VideoIcon;
			case "audio-tracks":
				return MusicNote01Icon;
			case "preview":
				return PlayIcon;
			case "inspector":
				return Cursor01Icon;
			case "tools":
				return ScissorIcon;
			case "chat":
				return MessageMultiple01Icon;
			case "remote-selections":
				return UserGroupIcon;
			case "match-end":
				return Clock01Icon;
			default:
				return PlayIcon;
		}
	};

	return (
		<div className="fixed inset-0 z-9999 pointer-events-auto">
			<svg className="fixed inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
				<defs>
					<mask id="tutorial-mask">
						<rect x="0" y="0" width="100%" height="100%" fill="white" />
						{highlightRect && (
							<rect
								x={highlightRect.left - (step.highlightPadding ?? 8)}
								y={highlightRect.top - (step.highlightPadding ?? 8)}
								width={highlightRect.width + (step.highlightPadding ?? 8) * 2}
								height={highlightRect.height + (step.highlightPadding ?? 8) * 2}
								rx={step.highlightBorderRadius ?? 8}
								ry={step.highlightBorderRadius ?? 8}
								fill="black"
							/>
						)}
					</mask>
				</defs>
				<rect
					x="0"
					y="0"
					width="100%"
					height="100%"
					fill="rgba(0, 0, 0, 0.85)"
					mask="url(#tutorial-mask)"
					style={{ transition: "all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
				/>
			</svg>

			{highlightRect && (
				<div
					className="fixed pointer-events-none border-2 border-primary animate-pulse"
					style={{
						left: highlightRect.left - (step.highlightPadding ?? 8),
						top: highlightRect.top - (step.highlightPadding ?? 8),
						width: highlightRect.width + (step.highlightPadding ?? 8) * 2,
						height: highlightRect.height + (step.highlightPadding ?? 8) * 2,
						borderRadius: step.highlightBorderRadius ?? 8,
						boxShadow: "0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(59, 130, 246, 0.3)",
						transition: "all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
					}}
				/>
			)}

			<div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

			<div
				className="bg-background border border-border rounded-xl shadow-2xl p-6 w-[380px]"
				style={{
					...getTooltipPosition(),
					transition: "top 300ms cubic-bezier(0.34, 1.56, 0.64, 1), left 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
				}}
			>
				<div className="flex items-start justify-between mb-4">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
							<HugeiconsIcon icon={getStepIcon(step.id)} size={24} className="text-primary" />
						</div>
						<div>
							<h3 className="font-semibold text-lg text-foreground">{step.title}</h3>
							<p className="text-xs text-muted-foreground">
								{currentStep + 1}/{tutorialSteps.length}
							</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
					>
						<HugeiconsIcon icon={Cancel01Icon} size={18} />
					</button>
				</div>

				<div className="mb-6">
					<p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{step.description}</p>

					{step.showPlaceholderImage && (
						<div className="mt-4 rounded-lg border border-border overflow-hidden">
							<img src="/selection.png" alt="Remote selections preview" className="w-full h-auto" />
						</div>
					)}
				</div>

				<div className="h-1 bg-muted rounded-full mb-4 overflow-hidden">
					<div
						className="h-full bg-primary rounded-full"
						style={{
							width: `${((currentStep + 1) / tutorialSteps.length) * 100}%`,
							transition: "width 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
						}}
					/>
				</div>

				<div className="flex items-center justify-between">
					<button
						onClick={handlePrev}
						disabled={isFirstStep}
						className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
							isFirstStep ? "text-muted-foreground cursor-not-allowed opacity-50" : "text-foreground hover:bg-accent"
						}`}
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
						Back
					</button>

					<button
						onClick={handleNext}
						className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
					>
						{isLastStep ? "Get Started" : "Next"}
						{!isLastStep && <HugeiconsIcon icon={ArrowRight01Icon} size={16} />}
					</button>
				</div>
			</div>
		</div>
	);
}

export default TutorialOverlay;
