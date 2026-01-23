"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Logout01Icon,
	Loading03Icon,
	UserIcon,
	Settings01Icon,
	HelpCircleIcon,
	ViewIcon,
	ViewOffIcon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";

function GoogleIcon({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
				fill="#4285F4"
			/>
			<path
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
				fill="#34A853"
			/>
			<path
				d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
				fill="#FBBC05"
			/>
			<path
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
				fill="#EA4335"
			/>
		</svg>
	);
}

export function UserMenu() {
	const router = useRouter();
	const { data: session, isPending } = useSession();
	const [showSignInDialog, setShowSignInDialog] = useState(false);
	const [isSigningIn, setIsSigningIn] = useState(false);
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [showEmail, setShowEmail] = useState(false);
	const [isAdmin, setIsAdmin] = useState(false);

	useEffect(() => {
		async function checkAdmin() {
			if (!session?.user) {
				setIsAdmin(false);
				return;
			}
			try {
				const response = await fetch("/api/user/status");
				if (response.ok) {
					const data = await response.json();
					setIsAdmin(data.isAdmin);
				} else {
					setIsAdmin(false);
				}
			} catch (error) {
				console.error("Error checking admin status:", error);
				setIsAdmin(false);
			}
		}
		checkAdmin();
	}, [session]);

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

	const handleGoogleSignIn = async () => {
		setIsSigningIn(true);
		try {
			await signIn.social({
				provider: "google",
				callbackURL: window.location.href,
			});
		} catch {
		} finally {
			setIsSigningIn(false);
		}
	};

	const handleSignOut = async () => {
		setIsSigningOut(true);
		try {
			await signOut({
				fetchOptions: {
					onSuccess: () => {
						window.location.reload();
					},
				},
			});
		} catch {
			setIsSigningOut(false);
		}
	};

	if (isPending) {
		return (
			<div className="flex items-center gap-2">
				<div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
			</div>
		);
	}

	if (!session) {
		return (
			<>
				<Button variant="outline" size="sm" onClick={() => setShowSignInDialog(true)} className="gap-2">
					Sign In
				</Button>

				<Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
					<DialogContent className="max-w-md">
						<DialogHeader>
							<DialogTitle>Sign in</DialogTitle>
							<DialogDescription>Create an account to make and join lobbies.</DialogDescription>
						</DialogHeader>

						<div className="py-4">
							<Button className="w-full gap-3 h-11" onClick={handleGoogleSignIn} disabled={isSigningIn}>
								{isSigningIn ? <HugeiconsIcon icon={Loading03Icon} className="h-5 w-5 animate-spin" /> : <GoogleIcon className="h-5 w-5" />}
								{isSigningIn ? "Signing in..." : "Continue with Google"}
							</Button>
						</div>

						<p className="text-xs text-muted-foreground text-center">
							By signing in, you agree to the{" "}
							<Link href="/terms" className="underline hover:text-foreground">
								Terms of Service
							</Link>{" "}
							and{" "}
							<Link href="/privacy" className="underline hover:text-foreground">
								Privacy Policy
							</Link>
						</p>
					</DialogContent>
				</Dialog>
			</>
		);
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

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
					<Avatar className="h-8 w-8">
						<AvatarImage src={user.image || undefined} alt={user.name || "User"} />
						<AvatarFallback className="text-xs">{initials}</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="end" forceMount>
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium leading-none">{user.name}</p>
						<div className="flex items-center gap-1">
							<p className="text-xs leading-none text-muted-foreground">{showEmail ? user.email : censorEmail(user.email || "")}</p>
							<button
								type="button"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									setShowEmail(!showEmail);
								}}
								className="text-muted-foreground hover:text-foreground transition-colors"
							>
								<HugeiconsIcon icon={showEmail ? ViewOffIcon : ViewIcon} className="h-3 w-3" />
							</button>
						</div>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/account")}>
						<HugeiconsIcon icon={UserIcon} className="h-4 w-4" />
						Account
					</DropdownMenuItem>
					{isAdmin && (
						<DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/users")}>
							<HugeiconsIcon icon={UserGroupIcon} className="h-4 w-4" />
							Manage Users
						</DropdownMenuItem>
					)}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/help")}>
						<HugeiconsIcon icon={HelpCircleIcon} className="h-4 w-4" />
						Help
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={handleSignOut}
					disabled={isSigningOut}
					className="cursor-pointer text-destructive focus:text-destructive"
				>
					{isSigningOut ? (
						<HugeiconsIcon icon={Loading03Icon} className="h-4 w-4 animate-spin" />
					) : (
						<HugeiconsIcon icon={Logout01Icon} className="h-4 w-4" />
					)}
					{isSigningOut ? "Signing out..." : "Sign out"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
