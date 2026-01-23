"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function BannedCheck({ children }: { children: React.ReactNode }) {
	const { data: session, isPending } = useSession();
	const [isBanned, setIsBanned] = useState<boolean | null>(null);
	const [isChecking, setIsChecking] = useState(true);

	useEffect(() => {
		async function checkBanStatus() {
			if (!session?.user) {
				setIsChecking(false);
				return;
			}

			try {
				const response = await fetch("/api/user/status");
				if (response.ok) {
					const data = await response.json();
					setIsBanned(data.isBanned);
				} else {
					console.error("Failed to check ban status:", response.status);
					setIsBanned(false);
				}
			} catch (error) {
				console.error("Error checking ban status:", error);
				setIsBanned(false);
			} finally {
				setIsChecking(false);
			}
		}

		if (!isPending) {
			checkBanStatus();
		}
	}, [session, isPending]);

	if (isPending || isChecking) {
		return <>{children}</>;
	}

	if (isBanned) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center p-4">
				<div className="text-center max-w-md">
					<h1 className="text-2xl font-bold text-destructive mb-4">Oh nuh nu nu nu nu</h1>
					<p className="text-muted-foreground mb-6">Your account has been banned from EditMash.</p>
					<p className="text-muted-foreground">
						If you believe this is a mistake, please{" "}
						<a
							href="https://discord.gg/facedev"
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary hover:underline font-medium"
						>
							contact support
						</a>
						.
					</p>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}
