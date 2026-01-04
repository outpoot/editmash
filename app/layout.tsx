import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://editmash.com";

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: {
		default: "EditMash",
		template: "%s | EditMash",
	},
	description:
		"Join timed matches and collaborate with dozens of players to create short, chaotic videos on a shared timeline. No skill required — just fun and creativity.",
	keywords: [
		"multiplayer video editor",
		"collaborative editing",
		"video game",
		"real-time editing",
		"group video creation",
		"social video",
		"chaotic editing",
		"timed matches",
		"creative chaos",
		"video collaboration",
		"facedev",
		"outpoot",
	],
	authors: [
		{ name: "FaceDev", url: "https://youtube.com/@FaceDevStuff" },
		{ name: "Outpoot", url: "https://outpoot.com" },
	],
	creator: "FaceDev",
	publisher: "Outpoot",
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	icons: {
		icon: "/favicon.svg",
		apple: "/favicon.svg",
	},
	openGraph: {
		type: "website",
		locale: "en_US",
		url: siteUrl,
		siteName: "EditMash",
		title: "EditMash",
		description:
			"Join timed matches and collaborate with dozens of players to create short, chaotic videos on a shared timeline. No skill required — just fun and creativity.",
		images: [
			{
				url: "/thumbnail.png",
				width: 1200,
				height: 630,
				alt: "EditMash — Create chaos together",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "EditMash",
		description:
			"Join timed matches and collaborate with dozens of players to create short, chaotic videos on a shared timeline. No skill required — just fun and creativity.",
		images: ["/thumbnail.png"],
		site: "@facedevstuff",
		creator: "@facedevstuff",
	},
	applicationName: "EditMash",
	appleWebApp: {
		capable: true,
		title: "EditMash",
		statusBarStyle: "default",
	},
	formatDetection: {
		telephone: false,
	},
	other: {
		"theme-color": "#1447e6",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
			{process.env.NODE_ENV === "development" && (
				<head>
					<script crossOrigin="anonymous" src="//unpkg.com/react-scan/dist/auto.global.js" />
				</head>
			)}
			<body className="antialiased">
				{children}
				<Toaster />
			</body>
		</html>
	);
}
