"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

export default function PrivacyPolicyPage() {
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
						<h1 className="text-xl font-bold">Privacy Policy</h1>
					</div>
				</div>
			</header>

			<main className="container mx-auto px-4 py-8 max-w-3xl">
				<p className="text-muted-foreground text-sm mb-8">Last updated: January 3, 2026</p>

				<div className="space-y-8">
					<section>
						<h2 className="text-4xl font-bold mb-4">1. Introduction</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								EditMash (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy
								explains how we collect, use, disclose, and safeguard your information when you use our multiplayer collaborative video
								editing platform at editmash.com (the &quot;Service&quot;).
							</p>
							<p>
								By using EditMash, you agree to the collection and use of information in accordance with this policy. If you do not agree
								with this policy, please do not use our Service.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">2. Information We Collect</h2>
						<div className="space-y-3 text-muted-foreground">
							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">2.1 Account Information</h3>
								<p>When you create an account using Google Sign-In, we collect:</p>
								<ul className="list-disc pl-6 space-y-1">
									<li>
										<strong className="text-foreground">Name:</strong> Your display name from your Google account (you can change this)
									</li>
									<li>
										<strong className="text-foreground">Email address:</strong> Used for account identification and communication
									</li>
									<li>
										<strong className="text-foreground">Profile picture:</strong> Your Google profile image (stored on our servers)
									</li>
									<li>
										<strong className="text-foreground">Account creation date:</strong> When you first signed up
									</li>
								</ul>
							</div>

							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">2.2 User-Generated Content</h3>
								<p>When you use EditMash, we store:</p>
								<ul className="list-disc pl-6 space-y-1">
									<li>
										<strong className="text-foreground">Media files:</strong> Videos, audio, and images you upload during matches
									</li>
									<li>
										<strong className="text-foreground">Edit history:</strong> Your clip placements and modifications on the timeline
									</li>
									<li>
										<strong className="text-foreground">Rendered videos:</strong> Final video outputs from collaborative editing sessions
									</li>
								</ul>
							</div>

							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">2.3 Technical Information</h3>
								<p>For security and service functionality, we collect:</p>
								<ul className="list-disc pl-6 space-y-1">
									<li>
										<strong className="text-foreground">IP address:</strong> Stored with your session for security purposes
									</li>
									<li>
										<strong className="text-foreground">User agent:</strong> Browser and device information for session management
									</li>
									<li>
										<strong className="text-foreground">Session tokens:</strong> To keep you logged in
									</li>
								</ul>
							</div>

							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">2.4 Preferences</h3>
								<p>We store your customization choices:</p>
								<ul className="list-disc pl-6 space-y-1">
									<li>
										<strong className="text-foreground">Highlight color:</strong> The color that identifies your clips to other players
									</li>
									<li>
										<strong className="text-foreground">Tutorial completion status:</strong> Whether you&apos;ve completed the onboarding
										tutorial
									</li>
								</ul>
							</div>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">3. How We Use Your Information</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>We use your information to:</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>Provide and operate the Service</li>
								<li>Authenticate your identity and maintain your session</li>
								<li>Display your profile to other players in lobbies and matches</li>
								<li>Store and serve your uploaded media files</li>
								<li>Render collaborative video projects</li>
								<li>Detect and prevent fraud, abuse, and security incidents</li>
								<li>Communicate with you about the Service (only if necessary)</li>
							</ul>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">4. How We Share Your Information</h2>
						<div className="space-y-3 text-muted-foreground">
							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">4.1 With Other Users</h3>
								<p>When you participate in matches, other players can see:</p>
								<ul className="list-disc pl-6 space-y-1">
									<li>Your display name</li>
									<li>Your profile picture</li>
									<li>Your highlight color</li>
									<li>Your clip contributions to the shared timeline</li>
								</ul>
							</div>

							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">4.2 With Service Providers</h3>
								<p>We use the following third-party services:</p>
								<ul className="list-disc pl-6 space-y-1">
									<li>
										<strong className="text-foreground">Google:</strong> For authentication (OAuth 2.0)
									</li>
									<li>
										<strong className="text-foreground">Backblaze B2:</strong> For secure cloud storage of media files and avatars
									</li>
								</ul>
							</div>

							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">4.3 Legal Requirements</h3>
								<p>We may disclose your information if required by law, court order, or government request.</p>
							</div>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">5. Cookies and Similar Technologies</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>We use the following cookies:</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>
									<strong className="text-foreground">Session cookie:</strong> Keeps you logged in (expires after 7 days of inactivity)
								</li>
							</ul>
							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">Analytics</h3>
								<p>
									We use <strong className="text-foreground">Plausible Analytics</strong>, a privacy-friendly, GDPR-compliant analytics service hosted in the EU. Plausible:
								</p>
								<ul className="list-disc pl-6 space-y-1 mt-2">
									<li>Does not use cookies or track personal data</li>
									<li>Does not collect IP addresses or device identifiers</li>
									<li>Provides anonymous, aggregate statistics only</li>
									<li>Is fully GDPR-compliant and hosted on European infrastructure</li>
									<li>Does not share data with third parties or use it for advertising</li>
								</ul>
							</div>
							<p>
								We do <strong className="text-foreground">not</strong> use advertising cookies, tracking pixels, or invasive analytics tools like Google Analytics.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">6. Data Retention</h2>
						<div className="space-y-3 text-muted-foreground">
							<ul className="list-disc pl-6 space-y-1">
								<li>
									<strong className="text-foreground">Account data:</strong> Retained until you delete your account
								</li>
								<li>
									<strong className="text-foreground">Match media:</strong> Associated with match records; may be deleted when matches are
									cleaned up
								</li>
								<li>
									<strong className="text-foreground">Session data:</strong> Automatically expires after 7 days of inactivity
								</li>
								<li>
									<strong className="text-foreground">Rendered videos:</strong> Retained for viewing in the results page
								</li>
							</ul>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">7. Your Rights and Choices</h2>
						<div className="space-y-3 text-muted-foreground">
							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">7.1 Access and Update</h3>
								<p>You can access and update your information through your Account page at any time, including:</p>
								<ul className="list-disc pl-6 space-y-1">
									<li>Changing your display name</li>
									<li>Updating your profile picture</li>
									<li>Changing your highlight color</li>
								</ul>
							</div>

							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">7.2 Account Deletion</h3>
								<p>
									You can permanently delete your account from your Account page. This is an{" "}
									<strong className="text-foreground">automatic, self-service process</strong> that immediately removes:
								</p>
								<ul className="list-disc pl-6 space-y-1">
									<li>Your user profile and account data</li>
									<li>Your sessions and authentication data</li>
									<li>Your lobby and match participation records</li>
									<li>Your uploaded avatar images</li>
								</ul>
							</div>

							<div>
								<h3 className="text-lg font-semibold text-foreground mb-2">7.3 Data Portability</h3>
								<p>
									You can download all your personal data from your Account page at any time. This is an{" "}
									<strong className="text-foreground">automatic, self-service process</strong>—click &quot;Download&quot; in the
									"My data" section to receive a complete JSON export of your account information, match history, edit operations,
									and more.
								</p>
							</div>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">8. Rights for European Users (GDPR)</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								If you are located in the European Economic Area (EEA), United Kingdom, or Switzerland, you have the following rights under
								the General Data Protection Regulation (GDPR):
							</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>
									<strong className="text-foreground">Right of access:</strong> Request a copy of your personal data
								</li>
								<li>
									<strong className="text-foreground">Right to rectification:</strong> Correct inaccurate data (via your Account page)
								</li>
								<li>
									<strong className="text-foreground">Right to erasure:</strong> Delete your account and data (self-service via Account
									page)
								</li>
								<li>
									<strong className="text-foreground">Right to restriction:</strong> Request we limit processing of your data
								</li>
								<li>
									<strong className="text-foreground">Right to data portability:</strong> Download your data in JSON format (self-service
									via Account page)
								</li>
								<li>
									<strong className="text-foreground">Right to object:</strong> Object to processing of your data
								</li>
								<li>
									<strong className="text-foreground">Right to withdraw consent:</strong> Where processing is based on consent
								</li>
							</ul>
							<p>
								<strong className="text-foreground">Legal basis for processing:</strong> We process your data based on (a) your consent when
								you sign up, (b) contractual necessity to provide the Service, and (c) legitimate interests in security and fraud
								prevention.
							</p>
							<p>
								To exercise any of these rights, contact us at{" "}
								<a href="mailto:support@outpoot.com" className="text-primary hover:underline">
									support@outpoot.com
								</a>
								. We will respond within 30 days.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">9. Rights for California Residents (CCPA)</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>If you are a California resident, you have the following rights under the California Consumer Privacy Act (CCPA):</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>
									<strong className="text-foreground">Right to know:</strong> What personal information we collect and how we use it
								</li>
								<li>
									<strong className="text-foreground">Right to delete:</strong> Request deletion of your personal information (self-service
									via Account page)
								</li>
								<li>
									<strong className="text-foreground">Right to opt-out:</strong> We do not sell your personal information
								</li>
								<li>
									<strong className="text-foreground">Right to non-discrimination:</strong> We will not discriminate against you for
									exercising your rights
								</li>
							</ul>
							<p>
								<strong className="text-foreground">We do not sell your personal information.</strong> We do not share your data with third
								parties for their marketing purposes.
							</p>
							<p>
								To exercise your rights, contact us at{" "}
								<a href="mailto:support@outpoot.com" className="text-primary hover:underline">
									support@outpoot.com
								</a>
								.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">10. International Data Transfers</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								Our servers are located in <strong className="text-foreground">Germany</strong>. Your data is primarily stored and processed
								in Germany in compliance with European data protection standards. We use service providers located in the United States
								(Backblaze B2 for media storage, Google for authentication). By using the Service, you consent to such transfers. We take
								appropriate safeguards to protect your data in accordance with applicable laws.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">11. Age Requirements</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								EditMash is not intended for individuals under <strong className="text-foreground">16 years of age</strong>. We do not
								knowingly collect personal information from individuals under 16. If we learn we have collected information from someone
								under 16, we will delete it immediately. If you believe someone under 16 has provided us with personal information, please
								contact us at{" "}
								<a href="mailto:support@outpoot.com" className="text-primary hover:underline">
									support@outpoot.com
								</a>
								.
							</p>
							<p>
								Due to the collaborative, user-generated nature of the Service, we cannot control or pre-screen all content uploaded by
								users. The age requirement helps ensure appropriate use of the platform.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">12. Security</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>We implement reasonable security measures to protect your personal information, including:</p>
							<ul className="list-disc pl-6 space-y-1">
								<li>Secure session management</li>
								<li>OAuth 2.0 authentication (no passwords stored)</li>
								<li>Rate limiting to prevent abuse</li>
							</ul>
							<p>However, no method of transmission over the Internet is 100% secure. We cannot guarantee absolute security.</p>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">13. Changes to This Policy</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>
								We may update this Privacy Policy from time to time. We will notify you of any material changes by updating the &quot;Last
								updated&quot; date at the top of this page. Your continued use of the Service after changes constitutes acceptance of the
								updated policy.
							</p>
						</div>
					</section>

					<section>
						<h2 className="text-4xl font-bold mb-4">14. Contact Us</h2>
						<div className="space-y-3 text-muted-foreground">
							<p>If you have any questions about this Privacy Policy or our data practices, contact us at:</p>
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
