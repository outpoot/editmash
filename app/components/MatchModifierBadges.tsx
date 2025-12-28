import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon, VolumeHighIcon, ScissorIcon, Layers01Icon, UserGroupIcon, FirstBracketIcon } from "@hugeicons/core-free-icons";
import { MatchConfig } from "../types/match";

interface MatchModifierBadgesProps {
	matchConfig: MatchConfig;
	showMaxPlayers?: boolean;
	vertical?: boolean;
}

export function MatchModifierBadges({ matchConfig, showMaxPlayers = false, vertical = false }: MatchModifierBadgesProps) {
	return (
		<TooltipProvider delayDuration={100}>
			<div className={vertical ? "flex flex-col gap-1" : "flex flex-wrap gap-1.5"}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Badge variant="secondary" className="gap-1 text-xs cursor-default w-fit">
							<HugeiconsIcon icon={FirstBracketIcon} className="w-3 h-3" />
							{matchConfig.timelineDuration}s
						</Badge>
					</TooltipTrigger>
					<TooltipContent>
						<p>Timeline duration is {matchConfig.timelineDuration} seconds.</p>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Badge variant="secondary" className="gap-1 text-xs cursor-default w-fit">
							<HugeiconsIcon icon={Clock01Icon} className="w-3 h-3" />
							{matchConfig.matchDuration}m
						</Badge>
					</TooltipTrigger>
					<TooltipContent>
						<p>Match duration is {matchConfig.matchDuration} minutes.</p>
					</TooltipContent>
				</Tooltip>

				{showMaxPlayers && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge variant="secondary" className="gap-1 text-xs cursor-default w-fit">
								<HugeiconsIcon icon={UserGroupIcon} className="w-3 h-3" />
								{matchConfig.maxPlayers}
							</Badge>
						</TooltipTrigger>
						<TooltipContent>
							<p>Maximum of {matchConfig.maxPlayers} players can join.</p>
						</TooltipContent>
					</Tooltip>
				)}

				<Tooltip>
					<TooltipTrigger asChild>
						<Badge variant="secondary" className="gap-1 text-xs cursor-default w-fit">
							<HugeiconsIcon icon={ScissorIcon} className="w-3 h-3" />
							{matchConfig.clipSizeMin}-{matchConfig.clipSizeMax}s
						</Badge>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							Clip duration is {matchConfig.clipSizeMin}s to {matchConfig.clipSizeMax}s.
						</p>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Badge variant="secondary" className="gap-1 text-xs cursor-default w-fit">
							<HugeiconsIcon icon={VolumeHighIcon} className="w-3 h-3" />
							{matchConfig.audioMaxDb > 0 ? "+" : ""}
							{matchConfig.audioMaxDb} dB
						</Badge>
					</TooltipTrigger>
					<TooltipContent>
						<p>Max volume is {matchConfig.audioMaxDb > 0 ? "+" : ""}{matchConfig.audioMaxDb} dB.</p>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Badge variant="secondary" className="gap-1 text-xs cursor-default w-fit">
							<HugeiconsIcon icon={Layers01Icon} className="w-3 h-3" />
							{matchConfig.maxVideoTracks}V/{matchConfig.maxAudioTracks}A
						</Badge>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							Track limit is {matchConfig.maxVideoTracks} video and {matchConfig.maxAudioTracks} audio.
						</p>
					</TooltipContent>
				</Tooltip>
			</div>
		</TooltipProvider>
	);
}
