import type { Metadata } from "next";

type Props = {
	params: Promise<{ matchId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { matchId } = await params;
	
	try {
		const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://editmash.com";
		const response = await fetch(`${baseUrl}/api/matches/${matchId}`, {
			next: { revalidate: 30 },
		});
		
		if (response.ok) {
			const data = await response.json();
			const match = data.match;
			const title = `${match.lobbyName} — Match in Progress`;
			const description = `Live match on EditMash! ${match.players?.length || 0} players creating a ${match.config?.timelineDuration || 30}s video together. Join the chaos!`;
			
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
		title: "Match in Progress",
		description: "A collaborative video editing match is in progress on EditMash. Players are working together to create chaotic videos on a shared timeline.",
		robots: {
			index: false,
			follow: false,
		},
	};
}

export default function MatchLayout({ children }: { children: React.ReactNode }) {
	return children;
}
