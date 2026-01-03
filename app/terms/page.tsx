"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

export default function TermsOfServicePage() {
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
						<h1 className="text-xl font-bold">Terms of Service</h1>
					</div>
				</div>
			</header>

			<main className="container mx-auto px-4 py-8 max-w-3xl">
				<p className="text-muted-foreground text-sm mb-8">Last updated: January 3, 2026</p>

				<div className="space-y-8">
					<section>
						<h2 className="text-2xl font-bold mb-4">1. Acceptance of Terms</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								By accessing or using EditMash (&quot;Service&quot;), operated by Outpoot (&quot;we,&quot; &quot;us,&quot; or
								&quot;our&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms,
								do not use the Service.
							</p>
							<p>
								We may modify these Terms at any time. Continued use of the Service after changes constitutes acceptance of the modified
								Terms.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">2. Description of Service</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								EditMash is a multiplayer collaborative video editing platform where users join timed &quot;matches&quot; to collaboratively
								create videos on a shared timeline. Key features include:
							</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>Creating and joining lobbies for collaborative editing sessions</li>
								<li>Uploading video, audio, and image files for use in editing</li>
								<li>Real-time collaborative editing with other users</li>
								<li>Automatic rendering of completed video projects</li>
							</ul>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">3. Eligibility</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								You must be at least <strong className="text-foreground">16 years old</strong> to use EditMash. By using the Service, you
								represent and warrant that you meet this age requirement. If you are under 16, you are not permitted to use the Service.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">4. Account Registration</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>To use EditMash, you must sign in using your Google account. You are responsible for:</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>Maintaining the confidentiality of your Google account credentials</li>
								<li>All activities that occur under your account</li>
								<li>Notifying us immediately of any unauthorized use of your account</li>
							</ul>
							<p>You may delete your account at any time through your Account page. Account deletion is automatic and irreversible.</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">5. User Conduct</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>You agree NOT to:</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>
									Upload, share, or create content that is illegal, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene,
									or otherwise objectionable
								</li>
								<li>
									Upload content that infringes on any third party&apos;s intellectual property rights, including copyrights and trademarks
								</li>
								<li>Upload content that contains malware, viruses, or other harmful code</li>
								<li>Impersonate any person or entity or misrepresent your affiliation</li>
								<li>Interfere with or disrupt the Service or servers</li>
								<li>Attempt to gain unauthorized access to the Service or other users&apos; accounts</li>
								<li>Use the Service for any illegal purpose</li>
								<li>Harass, bully, or intimidate other users</li>
								<li>Upload content depicting minors in inappropriate situations</li>
								<li>Use automated tools to access the Service (bots, scrapers, etc.) without permission</li>
								<li>Circumvent any rate limits or technical restrictions</li>
							</ul>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">6. Content and Intellectual Property</h2>
						<div className="space-y-4 text-muted-foreground">
							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">6.1 Your Content</h3>
								<p>
									You retain ownership of any content you upload to EditMash (&quot;Your Content&quot;). By uploading content, you grant us
									a non-exclusive, worldwide, royalty-free license to use, store, display, and process Your Content solely for the purpose
									of providing the Service.
								</p>
							</div>

							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">6.2 Responsibility for Content</h3>
								<p className="font-bold text-foreground">
									YOU ARE SOLELY AND EXCLUSIVELY RESPONSIBLE FOR YOUR CONTENT. WE ARE NOT RESPONSIBLE FOR ANY MEDIA, VIDEOS, AUDIO, IMAGES,
									OR OTHER CONTENT UPLOADED BY USERS.
								</p>
								<p>
									You are solely responsible for Your Content and all consequences of uploading, sharing, or distributing it. You represent
									and warrant that:
								</p>
								<ul className="list-disc pl-6 space-y-1 mt-2">
									<li>You own or have the necessary rights to use and authorize us to use Your Content</li>
									<li>Your Content does not infringe any third party&apos;s intellectual property or other rights</li>
									<li>Your Content complies with these Terms and all applicable laws</li>
									<li>Your Content does not contain illegal, pornographic, obscene, or otherwise prohibited material</li>
									<li>
										You will not upload content depicting illegal activities, minors in inappropriate situations, or content that violates
										any laws
									</li>
								</ul>
								<p className="font-semibold text-foreground">
									We do not pre-screen, monitor, or review all user content. By uploading content, you acknowledge that other users may view
									it, and you accept full legal responsibility for any content you upload. We reserve the right to remove any content that
									violates these Terms, but we have no obligation to monitor or remove content.
								</p>{" "}
							</div>
							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">6.3 Collaborative Works</h3>
								<p>Videos created collaboratively through EditMash are joint works. By participating in a match, you agree that:</p>
								<ul className="list-disc pl-6 space-y-1 mt-2">
									<li>Other participants may use, modify, and build upon your contributions within the match</li>
									<li>The final rendered video is a collaborative work of all participants</li>
									<li>We may display rendered videos as examples of user-created content</li>
								</ul>
							</div>

							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">6.4 Our Intellectual Property</h3>
								<p>
									The Service, including its design, features, and code, is owned by us and protected by intellectual property laws. You may
									not copy, modify, or distribute our intellectual property without permission.
								</p>
							</div>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">7. Copyright and DMCA</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								We respect intellectual property rights. If you believe content on EditMash infringes your copyright, please send a DMCA
								takedown notice to{" "}
								<a href="mailto:support@outpoot.com" className="text-primary hover:underline">
									support@outpoot.com
								</a>{" "}
								with:
							</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>Identification of the copyrighted work</li>
								<li>Identification of the infringing material and its location</li>
								<li>Your contact information</li>
								<li>A statement that you have a good faith belief the use is unauthorized</li>
								<li>
									A statement, under penalty of perjury, that the information is accurate and you are authorized to act on behalf of the
									copyright owner
								</li>
								<li>Your physical or electronic signature</li>
							</ul>
							<p>We may terminate accounts of repeat infringers.</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">8. Content Moderation</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>We reserve the right, but are not obligated, to:</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>Remove or disable access to any content that violates these Terms</li>
								<li>Suspend or terminate accounts that violate these Terms</li>
								<li>Report illegal content to appropriate authorities</li>
							</ul>
							<p className="font-bold text-foreground">
								WE DO NOT PRE-SCREEN, MONITOR, OR REVIEW USER-UPLOADED CONTENT. ALL CONTENT IS PROVIDED BY USERS AND DOES NOT REPRESENT OUR
								VIEWS OR ENDORSEMENT. WE ARE NOT RESPONSIBLE OR LIABLE FOR ANY USER CONTENT, INCLUDING CONTENT THAT MAY BE ILLEGAL,
								OFFENSIVE, INFRINGING, OR HARMFUL.
							</p>
							<p>
								Users who upload illegal, pornographic, or otherwise prohibited content are solely responsible and may face legal
								consequences, including but not limited to account takedowns from us. We cooperate with law enforcement regarding illegal content.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">9. Match and Lobby Rules</h2>
						<div className="space-y-3 text-muted-foreground">
							<ul className="list-disc pl-6 space-y-1">
								<li>Lobbies have configurable parameters set by the host (timeline duration, player limits, etc.)</li>
								<li>All participants in a match can edit the shared timeline</li>
								<li>When a match ends, the final timeline is rendered automatically</li>
								<li>You may only participate in one match at a time</li>
								<li>Lobby hosts may set and enforce their own additional rules within these Terms</li>
							</ul>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">10. File Upload Limits</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>The Service enforces limits on uploaded files:</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>Supported formats: Common video, audio, and image formats</li>
								<li>File size limits apply (varies by file type)</li>
								<li>Uploaded media is associated with specific matches</li>
							</ul>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">11. Disclaimers</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
								INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
							</p>
							<p className="font-bold text-foreground">
								WE SPECIFICALLY DISCLAIM ANY RESPONSIBILITY OR LIABILITY FOR USER-GENERATED CONTENT. WE DO NOT ENDORSE, VERIFY, OR GUARANTEE
								THE ACCURACY, LEGALITY, OR APPROPRIATENESS OF ANY CONTENT UPLOADED BY USERS.
							</p>
							<p>We do not warrant that:</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>The Service will be uninterrupted, secure, or error-free</li>
								<li>Results obtained from the Service will be accurate or reliable</li>
								<li>Any errors will be corrected</li>
								<li>User content will be appropriate, legal, or non-infringing</li>
							</ul>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">12. Limitation of Liability</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
								PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE.
							</p>
							<p>
								OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM YOUR USE OF THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US (IF ANY) IN
								THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">13. Indemnification</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								You agree to indemnify and hold us harmless from any claims, damages, losses, or expenses (including attorney&apos;s fees)
								arising from:
							</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>Your use of the Service</li>
								<li>Your Content</li>
								<li>Your violation of these Terms</li>
								<li>Your violation of any third party&apos;s rights</li>
							</ul>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">14. Termination</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								We may suspend or terminate your access to the Service at any time, with or without cause, with or without notice. Upon
								termination:
							</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>Your right to use the Service ceases immediately</li>
								<li>We may delete your account and associated data</li>
								<li>Sections that by their nature should survive termination will survive</li>
							</ul>
							<p>You may terminate your account at any time through your Account page.</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">15. Governing Law</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which we operate, without
								regard to conflict of law principles.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">16. Dispute Resolution</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								Any disputes arising from these Terms or the Service shall first be attempted to be resolved through good faith negotiation.
								If negotiation fails, disputes shall be resolved through binding arbitration, except where prohibited by law.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">17. Severability</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and
								effect.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">18. Entire Agreement</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								These Terms, together with our Privacy Policy, constitute the entire agreement between you and us regarding the Service.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-2xl font-bold mb-4">19. Contact</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>For questions about these Terms, contact us at:</p>
							<p>
								<strong className="text-foreground">Email:</strong>{" "}
								<a href="mailto:support@outpoot.com" className="text-primary hover:underline">
									support@outpoot.com
								</a>
							</p>
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
