"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDebouncedCallback } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useSession, signOut, getSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowLeft01Icon,
	UserIcon,
	Mail01Icon,
	Calendar01Icon,
	Shield01Icon,
	Logout01Icon,
	Delete01Icon,
	Loading03Icon,
	ViewIcon,
	ViewOffIcon,
	Tick01Icon,
	PencilEdit01Icon,
	Camera01Icon,
	Download04Icon,
} from "@hugeicons/core-free-icons";

export default function AccountPage() {
	const router = useRouter();
	const { data: session, isPending } = useSession();

	const [showEmail, setShowEmail] = useState(false);
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [deleteConfirmation, setDeleteConfirmation] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);

	const [isEditingName, setIsEditingName] = useState(false);
	const [newName, setNewName] = useState("");
	const [isSavingName, setIsSavingName] = useState(false);

	const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [displayName, setDisplayName] = useState<string | null>(null);
	const [highlightColor, setHighlightColor] = useState("#3b82f6");
	const [isSavingHighlightColor, setIsSavingHighlightColor] = useState(false);
	const [isExportingData, setIsExportingData] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const previewUrlsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!isPending && !session) {
			router.push("/");
		}
	}, [isPending, session, router]);

	useEffect(() => {
		return () => {
			previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
			previewUrlsRef.current.clear();
		};
	}, []);

	useEffect(() => {
		if (session?.user?.id) {
			fetch("/api/user")
				.then((res) => res.json())
				.then((data) => {
					if (!data.user) {
						throw new Error("Failed to fetch user");
					}
					if (data.user.image) {
						setAvatarUrl(data.user.image);
					}
					if (data.user.name) {
						setDisplayName(data.user.name);
						setNewName(data.user.name);
					}
					if (data.user.highlightColor) {
						setHighlightColor(data.user.highlightColor);
					}
				})
				.catch(console.error);
		}
	}, [session?.user?.id]);

	useEffect(() => {
		if (session?.user?.name && !displayName) {
			setNewName(session.user.name);
		}
	}, [session?.user?.name, displayName]);

	const censorEmail = (email: string) => {
		const atIndex = email.indexOf("@");
		if (atIndex === -1) return email;
		const localPart = email.slice(0, atIndex);
		const domain = email.slice(atIndex);
		if (localPart.length <= 3) return email;
		const first = localPart[0];
		const lastTwo = localPart.slice(-2);
		const middle = "*".repeat(localPart.length - 3);
		return first + middle + lastTwo + domain;
	};

	const handleSignOut = async () => {
		setIsSigningOut(true);
		try {
			await signOut({
				fetchOptions: {
					onSuccess: () => {
						router.push("/");
					},
				},
			});
		} catch {
			setIsSigningOut(false);
			toast.error("Failed to sign out");
		}
	};

	const handleSaveName = async () => {
		const currentName = displayName || session?.user?.name;
		if (!newName.trim() || newName.trim() === currentName) {
			setIsEditingName(false);
			return;
		}

		if (newName.trim().length > 32) {
			toast.error("Name must be 32 characters or less");
			return;
		}

		setIsSavingName(true);
		try {
			const response = await fetch("/api/user", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: newName.trim() }),
			});

			if (!response.ok) {
				throw new Error("Failed to update name");
			}

			setDisplayName(newName.trim());
			toast.success("Name updated successfully");
			setIsEditingName(false);
		} catch {
			toast.error("Failed to update name");
		} finally {
			setIsSavingName(false);
		}
	};

	const handleAvatarClick = () => {
		fileInputRef.current?.click();
	};

	const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
		if (!allowedTypes.includes(file.type)) {
			toast.error("Invalid file type. Allowed: JPEG, PNG, WebP");
			return;
		}

		const maxSize = 5 * 1024 * 1024;
		if (file.size > maxSize) {
			toast.error("File too large. Maximum size is 5MB");
			return;
		}

		const previousAvatarUrl = avatarUrl;
		if (previousAvatarUrl && previousAvatarUrl.startsWith("blob:")) {
			URL.revokeObjectURL(previousAvatarUrl);
			previewUrlsRef.current.delete(previousAvatarUrl);
		}

		const previewUrl = URL.createObjectURL(file);
		previewUrlsRef.current.add(previewUrl);
		setAvatarUrl(previewUrl);

		setIsUploadingAvatar(true);
		try {
			const formData = new FormData();
			formData.append("avatar", file);

			const response = await fetch("/api/user", {
				method: "PATCH",
				body: formData,
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to upload avatar");
			}

			const data = await response.json();

			if (data.image) {
				setAvatarUrl(data.image);
			}

			toast.success("Avatar updated successfully");
			// Force session refresh to update cookie cache
			await getSession({ query: { disableCookieCache: true } });
		} catch (err) {
			setAvatarUrl(previousAvatarUrl);
			toast.error(err instanceof Error ? err.message : "Failed to upload avatar");
		} finally {
			URL.revokeObjectURL(previewUrl);
			previewUrlsRef.current.delete(previewUrl);
			setIsUploadingAvatar(false);
			// Reset the file input
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const handleDeleteAccount = async () => {
		if (deleteConfirmation !== "DELETE") return;

		setIsDeleting(true);
		try {
			const response = await fetch("/api/user", {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete account");
			}

			toast.success("Account deleted successfully");
			await signOut();
			router.push("/");
		} catch {
			toast.error("Failed to delete account");
		} finally {
			setIsDeleting(false);
		}
	};

	const saveHighlightColor = useCallback(async (color: string) => {
		setIsSavingHighlightColor(true);
		try {
			const response = await fetch("/api/user", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ highlightColor: color }),
			});

			if (!response.ok) {
				throw new Error("Failed to update highlight color");
			}

			toast.success("Highlight color updated");
		} catch {
			toast.error("Failed to update highlight color");
		} finally {
			setIsSavingHighlightColor(false);
		}
	}, []);

	const handleHighlightColorChange = useDebouncedCallback(saveHighlightColor, 500);

	const handleExportData = async () => {
		setIsExportingData(true);
		try {
			const response = await fetch("/api/user/export");

			if (!response.ok) {
				throw new Error("Failed to export data");
			}

			const blob = await response.blob();
			const contentDisposition = response.headers.get("Content-Disposition");
			const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] || "editmash-data-export.json";

			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			toast.success("Data exported successfully");
		} catch {
			toast.error("Failed to export data");
		} finally {
			setIsExportingData(false);
		}
	};

	if (isPending) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (!session) {
		return null;
	}

	const user = session.user;
	const initials =
		user.name
			?.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2) ||
		user.email?.slice(0, 2).toUpperCase() ||
		"??";

	const createdAt = user.createdAt ? new Date(user.createdAt) : null;

	return (
		<div className="min-h-screen bg-background">
			<header className="border-b bg-card">
				<div className="container mx-auto px-4 py-4 flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button variant="ghost" size="icon" onClick={() => router.push("/")}>
							<HugeiconsIcon icon={ArrowLeft01Icon} className="w-5 h-5" />
						</Button>
						<div className="flex items-center gap-2">
							<img src="/editmash.svg" alt="EditMash Logo" className="w-6 h-6" />
							<h1 className="text-xl font-bold">Account</h1>
						</div>
					</div>
				</div>
			</header>

			<main className="container mx-auto px-4 py-8 max-w-2xl">
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<HugeiconsIcon icon={UserIcon} className="w-5 h-5" />
								Profile
							</CardTitle>
							<CardDescription>Your personal information</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="flex items-center gap-4">
								<input
									ref={fileInputRef}
									type="file"
									accept="image/jpeg,image/png,image/webp"
									onChange={handleAvatarChange}
									className="hidden"
								/>
								<button onClick={handleAvatarClick} disabled={isUploadingAvatar} className="relative group cursor-pointer">
									<Avatar className="w-16 h-16">
										<AvatarImage src={avatarUrl || user.image || undefined} alt={user.name || "User"} />
										<AvatarFallback className="text-lg">{initials}</AvatarFallback>
									</Avatar>
									<div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
										{isUploadingAvatar ? (
											<HugeiconsIcon icon={Loading03Icon} className="w-5 h-5 text-white animate-spin" />
										) : (
											<HugeiconsIcon icon={Camera01Icon} className="w-5 h-5 text-white" />
										)}
									</div>
								</button>
								<div>
									<p className="text-sm text-muted-foreground">Profile picture</p>
									<p className="text-xs text-muted-foreground/70">Click to upload a new photo</p>
								</div>
							</div>

							<Separator />

							<div className="space-y-2">
								<Label className="text-muted-foreground text-xs uppercase tracking-wide">Display Name</Label>
								{isEditingName ? (
									<div className="flex gap-2">
										<Input
											value={newName}
											onChange={(e) => setNewName(e.target.value)}
											placeholder="Enter your name"
											className="flex-1"
											autoFocus
											maxLength={32}
										/>
										<Button size="sm" onClick={handleSaveName} disabled={isSavingName}>
											{isSavingName ? (
												<HugeiconsIcon icon={Loading03Icon} className="w-4 h-4 animate-spin" />
											) : (
												<HugeiconsIcon icon={Tick01Icon} className="w-4 h-4" />
											)}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setIsEditingName(false);
												setNewName(displayName || user.name || "");
											}}
										>
											Cancel
										</Button>
									</div>
								) : (
									<div className="flex items-center justify-between">
										<p className="font-medium">{displayName || user.name}</p>
										<Button variant="ghost" size="sm" onClick={() => setIsEditingName(true)}>
											<HugeiconsIcon icon={PencilEdit01Icon} className="w-4 h-4" />
										</Button>
									</div>
								)}
							</div>

							<div className="space-y-2">
								<Label className="text-muted-foreground text-xs uppercase tracking-wide">Email</Label>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<HugeiconsIcon icon={Mail01Icon} className="w-4 h-4 text-muted-foreground" />
										<p className="font-medium">{showEmail ? user.email : censorEmail(user.email || "")}</p>
									</div>
									<Button variant="ghost" size="sm" onClick={() => setShowEmail(!showEmail)}>
										<HugeiconsIcon icon={showEmail ? ViewOffIcon : ViewIcon} className="w-4 h-4" />
									</Button>
								</div>
							</div>

							{createdAt && (
								<div className="space-y-2">
									<Label className="text-muted-foreground text-xs uppercase tracking-wide">Member Since</Label>
									<div className="flex items-center gap-2">
										<HugeiconsIcon icon={Calendar01Icon} className="w-4 h-4 text-muted-foreground" />
										<p className="font-medium">
											{createdAt.toLocaleDateString("en-US", {
												year: "numeric",
												month: "long",
												day: "numeric",
											})}
										</p>
									</div>
								</div>
							)}

							<Separator />

							<div className="space-y-2">
								<Label className="text-muted-foreground text-xs uppercase tracking-wide">Highlight</Label>
								<p className="text-xs text-muted-foreground/70">This color shows other players which clips you have selected</p>
								<div className="flex items-center gap-3">
									<div className="relative w-10 h-10">
										<input
											type="color"
											value={highlightColor}
											onChange={(e) => {
												setHighlightColor(e.target.value);
												handleHighlightColorChange(e.target.value);
											}}
											className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
										/>
										<div
											className="w-full h-full rounded-lg border border-border pointer-events-none"
											style={{ backgroundColor: highlightColor }}
										/>
									</div>
									<Input
										value={highlightColor}
										onChange={(e) => {
											const val = e.target.value;
											if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
												setHighlightColor(val);
												if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
													handleHighlightColorChange(val);
												}
											}
										}}
										placeholder="#3b82f6"
										className="w-28 font-mono text-sm"
										maxLength={7}
									/>
									{isSavingHighlightColor && <HugeiconsIcon icon={Loading03Icon} className="w-4 h-4 animate-spin text-muted-foreground" />}
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<HugeiconsIcon icon={Shield01Icon} className="w-5 h-5" />
								Security
							</CardTitle>
							<CardDescription>Manage your account security</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="font-medium">My data</p>
									<p className="text-sm text-muted-foreground">Export all your personal data as a JSON file</p>
								</div>
								<Button variant="outline" onClick={handleExportData} disabled={isExportingData}>
									{isExportingData ? (
										<HugeiconsIcon icon={Loading03Icon} className="w-4 h-4 animate-spin" />
									) : (
										<HugeiconsIcon icon={Download04Icon} className="w-4 h-4" />
									)}
									<span>{isExportingData ? "Exporting..." : "Download"}</span>
								</Button>
							</div>
							<div className="flex items-center justify-between">
								<div>
									<p className="font-medium">Sign out</p>
									<p className="text-sm text-muted-foreground">Sign out of your account on this device</p>
								</div>
								<Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
									{isSigningOut ? (
										<HugeiconsIcon icon={Loading03Icon} className="w-4 h-4 animate-spin" />
									) : (
										<HugeiconsIcon icon={Logout01Icon} className="w-4 h-4" />
									)}
									<span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
								</Button>
							</div>
						</CardContent>
					</Card>

					<Card className="border-destructive/50">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base text-destructive">
								<HugeiconsIcon icon={Delete01Icon} className="w-5 h-5" />
								Danger
							</CardTitle>
							<CardDescription>Irreversible and destructive actions</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex items-center justify-between">
								<div>
									<p className="font-medium">Delete account</p>
									<p className="text-sm text-muted-foreground">Permanently delete your account and all associated data</p>
								</div>
								<Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
									<DialogTrigger asChild>
										<Button variant="destructive">Delete Account</Button>
									</DialogTrigger>
									<DialogContent>
										<DialogHeader>
											<DialogTitle>Delete Account</DialogTitle>
											<DialogDescription>
												This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
											</DialogDescription>
										</DialogHeader>

										<div className="py-4 space-y-4">
											<p className="text-sm text-muted-foreground">
												Type <span className="font-mono font-bold text-foreground">DELETE</span> to confirm:
											</p>
											<Input
												value={deleteConfirmation}
												onChange={(e) => setDeleteConfirmation(e.target.value)}
												placeholder="DELETE"
												className="font-mono"
											/>
										</div>

										<DialogFooter>
											<Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>
												Cancel
											</Button>
											<Button variant="destructive" onClick={handleDeleteAccount} disabled={deleteConfirmation !== "DELETE" || isDeleting}>
												{isDeleting ? (
													<>
														<HugeiconsIcon icon={Loading03Icon} className="w-4 h-4 animate-spin" />
														Deleting...
													</>
												) : (
													"Delete Account"
												)}
											</Button>
										</DialogFooter>
									</DialogContent>
								</Dialog>
							</div>
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
