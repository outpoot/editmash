"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowLeft01Icon,
	HelpCircleIcon,
	UserGroupIcon,
	Video01Icon,
	Clock01Icon,
	Upload04Icon,
	Settings01Icon,
	Mail01Icon,
	Delete01Icon,
	Shield01Icon,
} from "@hugeicons/core-free-icons";

export default function HelpPage() {
	const router = useRouter();

	return (
		<div className="min-h-screen bg-background">
			<header className="border-b bg-card">
				<div className="container mx-auto px-4 py-4 flex items-center gap-4">
					<Button variant="ghost" size="icon" onClick={() => router.push("/")}>
						<HugeiconsIcon icon={ArrowLeft01Icon} className="w-5 h-5" />
					</Button>
					<div className="flex items-center gap-2">
						<img src="/editmash.svg" alt="EditMash Logo" className="w-6 h-6" />
						<h1 className="text-xl font-bold">Help</h1>
					</div>
				</div>
			</header>

			<main className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
				<section>
					<h2 className="text-2xl font-bold mb-4">What is EditMash?</h2>
					<p className="text-muted-foreground mb-4">
						EditMash is a multiplayer collaborative video editor where multiple players join timed &quot;matches&quot; to create videos
						together on a shared timeline. The goal is entertainment and creative chaos — work with others to create something unique!
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-bold mb-4">Getting Started</h2>
					<div className="space-y-4">
						<div className="flex gap-4 items-start">
							<div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
								1
							</div>
							<div>
								<h3 className="font-semibold">Sign In</h3>
								<p className="text-muted-foreground text-sm">
									Click &quot;Sign In&quot; and authenticate with your Google account. No passwords required.
								</p>
							</div>
						</div>
						<div className="flex gap-4 items-start">
							<div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
								2
							</div>
							<div>
								<h3 className="font-semibold">Join or Create a Lobby</h3>
								<p className="text-muted-foreground text-sm">
									Browse available lobbies and click &quot;Join&quot;, or create your own with custom settings.
								</p>
							</div>
						</div>
						<div className="flex gap-4 items-start">
							<div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
								3
							</div>
							<div>
								<h3 className="font-semibold">Wait for the Match</h3>
								<p className="text-muted-foreground text-sm">Once enough players join and the host starts the match, editing begins!</p>
							</div>
						</div>
						<div className="flex gap-4 items-start">
							<div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
								4
							</div>
							<div>
								<h3 className="font-semibold">Upload and Edit</h3>
								<p className="text-muted-foreground text-sm">
									Upload your media (video, audio, images) and drag clips onto the shared timeline.
								</p>
							</div>
						</div>
						<div className="flex gap-4 items-start">
							<div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
								5
							</div>
							<div>
								<h3 className="font-semibold">Watch the Results</h3>
								<p className="text-muted-foreground text-sm">
									When time runs out, the final video is rendered. View it on the results page!
								</p>
							</div>
						</div>
					</div>
				</section>

				<section>
					<h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
					<Accordion type="single" collapsible className="w-full">
						<AccordionItem value="lobbies">
							<AccordionTrigger>
								<div className="flex items-center gap-2">
									<HugeiconsIcon icon={UserGroupIcon} className="w-4 h-4" />
									How do lobbies and matches work?
								</div>
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<p className="mb-2">
									<strong>Lobbies</strong> are waiting rooms where players gather before a match. The host can configure match settings like
									timeline duration, player limits, and more.
								</p>
								<p>
									<strong>Matches</strong> are timed collaborative editing sessions. All players share the same timeline and can add, move,
									and modify clips. When time expires, the final video is automatically rendered.
								</p>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="upload">
							<AccordionTrigger>
								<div className="flex items-center gap-2">
									<HugeiconsIcon icon={Upload04Icon} className="w-4 h-4" />
									What files can I upload?
								</div>
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<p>You can upload:</p>
								<ul className="list-disc ml-6 mt-2">
									<li>
										<strong>Videos:</strong> MP4, WebM, MOV, and other common formats
									</li>
									<li>
										<strong>Audio:</strong> MP3, WAV, OGG, and other audio formats
									</li>
									<li>
										<strong>Images:</strong> JPEG, PNG, GIF, WebP
									</li>
								</ul>
								<p className="mt-2">Files are uploaded to our secure cloud storage and only accessible during the match.</p>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="settings">
							<AccordionTrigger>
								<div className="flex items-center gap-2">
									<HugeiconsIcon icon={Settings01Icon} className="w-4 h-4" />
									What do the match settings mean?
								</div>
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<ul className="space-y-2">
									<li>
										<strong>Timeline Duration:</strong> Length of the final video (5-60 seconds)
									</li>
									<li>
										<strong>Match Duration:</strong> How long players have to edit (1-10 minutes)
									</li>
									<li>
										<strong>Capacity:</strong> Maximum number of players who can join
									</li>
									<li>
										<strong>Max Volume:</strong> Audio volume ceiling in decibels
									</li>
									<li>
										<strong>Max Clip Duration:</strong> Longest clip a player can add
									</li>
									<li>
										<strong>Video/Audio Tracks:</strong> Number of layers available
									</li>
									<li>
										<strong>Max Clips per Player:</strong> Limit on how many clips each player can add (0 = unlimited)
									</li>
								</ul>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="editing">
							<AccordionTrigger>
								<div className="flex items-center gap-2">
									<HugeiconsIcon icon={Video01Icon} className="w-4 h-4" />
									How do I use the editor?
								</div>
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<ul className="space-y-2">
									<li>
										<strong>Add clips:</strong> Drag media from the Media Browser onto the timeline
									</li>
									<li>
										<strong>Move clips:</strong> Click and drag clips to reposition them
									</li>
									<li>
										<strong>Trim clips:</strong> Drag the edges of clips to adjust their start/end points
									</li>
									<li>
										<strong>Select multiple:</strong> Hold Shift or Ctrl while clicking to select multiple clips
									</li>
									<li>
										<strong>Blade tool:</strong> Split clips at any point on the timeline
									</li>
									<li>
										<strong>Snap mode:</strong> Enable the magnet tool to snap clips to each other
									</li>
								</ul>
								<p className="mt-2">Your clips are highlighted with your unique color so other players can see who added what!</p>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="account">
							<AccordionTrigger>
								<div className="flex items-center gap-2">
									<HugeiconsIcon icon={Shield01Icon} className="w-4 h-4" />
									How do I manage my account?
								</div>
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<p className="mb-2">
									Click on your avatar in the top right corner and select &quot;Account&quot; to access your account page. There you can:
								</p>
								<ul className="list-disc ml-6">
									<li>Change your display name</li>
									<li>Upload a custom profile picture</li>
									<li>Change your highlight color</li>
									<li>Sign out</li>
									<li>Delete your account</li>
								</ul>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="delete">
							<AccordionTrigger>
								<div className="flex items-center gap-2">
									<HugeiconsIcon icon={Delete01Icon} className="w-4 h-4" />
									How do I delete my account and data?
								</div>
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<p className="mb-2">
									Account deletion is <strong>automatic and self-service</strong>. No need to contact us!
								</p>
								<ol className="list-decimal ml-6 mb-2">
									<li>Go to your Account page</li>
									<li>Scroll to the &quot;Danger Zone&quot; section</li>
									<li>Click &quot;Delete Account&quot;</li>
									<li>Type DELETE to confirm</li>
								</ol>
								<p>
									This immediately and permanently deletes your account, profile, sessions, and uploaded avatars. This action cannot be
									undone.
								</p>
								<p className="mt-2">
									If you encounter any issues, contact{" "}
									<a href="mailto:support@outpoot.com" className="text-primary hover:underline">
										support@outpoot.com
									</a>
									.
								</p>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="privacy">
							<AccordionTrigger>
								<div className="flex items-center gap-2">
									<HugeiconsIcon icon={Shield01Icon} className="w-4 h-4" />
									What data do you collect?
								</div>
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<p>We collect only what&apos;s necessary to provide the service:</p>
								<ul className="list-disc ml-6 mt-2">
									<li>Your name and email (from Google Sign-In)</li>
									<li>Your profile picture</li>
									<li>Media you upload during matches</li>
									<li>Your session info (IP address and browser) for security</li>
								</ul>
								<p className="mt-2">
									We use <strong>Plausible Analytics</strong> (a privacy-friendly, cookie-free analytics service hosted in the EU) for
									anonymous usage statistics. We do <strong>not</strong> use invasive tracking, advertising cookies, or tools that collect
									personal data. Read our full{" "}
									<a href="/privacy" className="text-primary hover:underline">
										Privacy Policy
									</a>{" "}
									for details.
								</p>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</section>

				<section>
					<Card className="bg-primary/5 border-primary/20">
						<CardHeader>
							<div className="flex items-center gap-2">
								<HugeiconsIcon icon={Mail01Icon} className="w-5 h-5 text-primary" />
								<CardTitle>Hey, you over there!</CardTitle>
							</div>
						</CardHeader>
						<CardContent className="space-y-3">
							<p className="text-muted-foreground">
								Can&apos;t find what you&apos;re looking for? Encountered a bug? Have a feature request?
							</p>
							<div className="flex flex-col gap-2">
								<a href="https://discord.gg/facedev" target="_blank" rel="noopener noreferrer">
									<Button className="w-full" variant="default">
										Join our Discord server
									</Button>
								</a>
								<p className="text-sm text-center text-muted-foreground">
									or email us at{" "}
									<a href="mailto:support@outpoot.com" className="text-primary font-medium hover:underline">
										support@outpoot.com
									</a>
								</p>
							</div>
						</CardContent>
					</Card>
				</section>
			</main>
		</div>
	);
}
