"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DataUsageWarning() {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				onClick={() => setOpen(true)}
				className="fixed bottom-4 left-4 w-12 h-12 rounded-full bg-white dark:bg-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center z-50 group"
				aria-label="Data usage warning"
			>
				<svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-black" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 6V14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
					<circle cx="12" cy="20" r="1.5" fill="currentColor" />
				</svg>
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-orange-600">
							HIGH DATA USAGE
						</DialogTitle>
					</DialogHeader>

					<div className="space-y-4 py-2">
						<DialogDescription className="text-base leading-relaxed">
							EditMash matches consume significant bandwidth. Be aware of the following:
						</DialogDescription>

						<div className="space-y-3 text-sm">
							<div className="space-y-1.5">
								<h4 className="font-semibold text-foreground">During a Match:</h4>
								<ul className="space-y-1 list-disc list-inside text-muted-foreground">
									<li>
										<strong>Media uploads:</strong> Players can upload up to 50 MB per file, 50 files each.
									</li>
									<li>
										<strong>Real-time sync:</strong> Continuous WebSocket data for timeline updates (low, but constant)
									</li>
									<li>
										<strong>Player count:</strong> More players = more data being sent/received
									</li>
								</ul>
							</div>

							<div className="space-y-1.5">
								<h4 className="font-semibold text-foreground">Recommendations:</h4>
								<ul className="space-y-1 list-disc list-inside text-muted-foreground">
									<li>
										<strong>Use WiFi or Ethernet</strong> - Strong wired connection recommended
									</li>
									<li>
										<strong>Avoid mobile data</strong> - Can quickly deplete your data plan
									</li>
									<li>
										<strong>Check your connection</strong> - Ensure unlimited or high-cap plan
									</li>
									<li>
										<strong>Monitor usage</strong> - Keep an eye on your data consumption
									</li>
								</ul>
							</div>
						</div>

						<DialogDescription className="text-xs text-muted-foreground italic">
							By participating in matches, you acknowledge that significant data transfer will occur and you are responsible for any
							associated costs.
						</DialogDescription>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
