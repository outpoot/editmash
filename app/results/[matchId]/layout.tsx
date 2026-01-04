import type { Metadata } from "next";

type Props = {
	params: Promise<{ matchId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { matchId } = await params;

	try {
		const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://editmash.com";
		const response = await fetch(`${baseUrl}/api/matches/${matchId}?results=true`, {
			next: { revalidate: 60 },
		});

		if (response.ok) {
			const data = await response.json();
			const match = data.match;
			const playerCount = match.players?.length || 0;
			const editCount = match.editCount || 0;
			const duration = match.config?.timelineDuration || 30;

			const title = `${match.lobbyName} — Results`;
			const description = `Watch this ${duration}s collaborative video made by ${playerCount} players with ${editCount} edits on EditMash!`;

			const images = match.renderUrl
				? [{ url: match.renderUrl.replace(/\.mp4$/, "_thumb.jpg"), width: 1280, height: 720, alt: match.lobbyName }]
				: [{ url: "/apple-touch-icon.png", width: 512, height: 512, alt: "EditMash Logo" }];

			return {
				title,
				description,
				openGraph: {
					title,
					description,
					type: "video.other",
					videos: match.renderUrl ? [{ url: match.renderUrl }] : undefined,
					images,
				},
				twitter: {
					card: match.renderUrl ? "player" : "summary_large_image",
					title,
					description,
					images: images?.map((img) => img.url),
				},
			};
		}
	} catch {
		// fall back to generic metadata
	}

	return {
		title: "Match Results",
		description:
			"Watch the chaotic result of a collaborative video editing match on EditMash. See what happens when multiple players edit the same timeline!",
	};
}

export default function ResultsLayout({ children }: { children: React.ReactNode }) {
	return children;
}
