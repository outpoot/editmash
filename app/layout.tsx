import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
	title: "EditMash",
	description:
		"EditMash is a multiplayer video editor where large groups of people collaborate in real time to make short, chaotic, and entertaining videos together. Players join timed, rule-based sessions with limits on clips and length, shaping a shared timeline before time runs out.",
	icons: {
		icon: "/favicon.svg",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
			<body className="antialiased">
				{children}
				<Toaster />
			</body>
		</html>
	);
}
