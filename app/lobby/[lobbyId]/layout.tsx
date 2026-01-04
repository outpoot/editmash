import { Lobby } from "@/app/types/lobby";
import type { Metadata } from "next";

type Props = {
	params: Promise<{ lobbyId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { lobbyId } = await params;

	try {
		const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://editmash.com";
		const response = await fetch(`${baseUrl}/api/lobbies/${lobbyId}`, {
			next: { revalidate: 30 },
		});

		if (response.ok) {
			const lobby: Lobby = await response.json();
			const title = `${lobby.name} — Lobby`;
			const description = `Join "${lobby.name}" on EditMash! ${lobby.players?.length || 0}/${
				lobby.matchConfig?.maxPlayers || "?"
			} players. Create chaotic videos together in a ${lobby.matchConfig?.timelineDuration || 30}s timeline.`;

			return {
				title,
				description,
				openGraph: {
					title,
					description,
					images: [
						{
							url: "/apple-touch-icon.png",
							width: 512,
							height: 512,
							alt: "EditMash Logo",
						},
					],
				},
				twitter: {
					title,
					description,
					images: ["/thumbnail.png"],
				},
				robots: {
					index: false,
					follow: false,
				},
			};
		}
	} catch {
		// Fall back to generic metadata
	}

	return {
		title: "Join Lobby",
		description: "Join this EditMash lobby and collaborate with other players to create chaotic videos on a shared timeline.",
		robots: {
			index: false,
			follow: false,
		},
	};
}

export default function LobbyLayout({ children }: { children: React.ReactNode }) {
	return children;
}
