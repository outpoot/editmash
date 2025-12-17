import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, Volume2, Scissors, Layers, Users, Brackets } from "lucide-react";
import { MatchConfig } from "../types/match";

interface MatchModifierBadgesProps {
	matchConfig: MatchConfig;
	showMaxPlayers?: boolean;
}

export function MatchModifierBadges({ matchConfig, showMaxPlayers = false }: MatchModifierBadgesProps) {
	return (
		<TooltipProvider delayDuration={100}>
			<div className="flex flex-wrap gap-1.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<Badge variant="secondary" className="gap-1 text-xs cursor-default">
							<Brackets className="w-3 h-3" />
							{matchConfig.timelineDuration}s
						</Badge>
					</TooltipTrigger>
					<TooltipContent>
						<p>Timeline duration is {matchConfig.timelineDuration} seconds.</p>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Badge variant="secondary" className="gap-1 text-xs cursor-default">
							<Clock className="w-3 h-3" />
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
							<Badge variant="secondary" className="gap-1 text-xs cursor-default">
								<Users className="w-3 h-3" />
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
						<Badge variant="secondary" className="gap-1 text-xs cursor-default">
							<Scissors className="w-3 h-3" />
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
						<Badge variant="secondary" className="gap-1 text-xs cursor-default">
							<Volume2 className="w-3 h-3" />
							{(matchConfig.audioMaxVolume * 100).toFixed(0)}%
						</Badge>
					</TooltipTrigger>
					<TooltipContent>
						<p>Max volume is {(matchConfig.audioMaxVolume * 100).toFixed(0)}%.</p>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Badge variant="secondary" className="gap-1 text-xs cursor-default">
							<Layers className="w-3 h-3" />
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
