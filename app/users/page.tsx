"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowLeft02Icon, ArrowRight02Icon, Search01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { UserMenu } from "../components/UserMenu";

interface AdminUser {
	id: string;
	name: string;
	email: string;
	image: string | null;
	isAdmin: boolean;
	isBanned: boolean;
	createdAt: string;
}

const USERS_PER_PAGE = 20;

export default function UsersPage() {
	const router = useRouter();
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [currentPage, setCurrentPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [search, setSearch] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [banningUser, setBanningUser] = useState<string | null>(null);

	const fetchUsers = useCallback(async () => {
		try {
			const offset = (currentPage - 1) * USERS_PER_PAGE;
			const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
			const response = await fetch(`/api/admin/users?limit=${USERS_PER_PAGE}&offset=${offset}${searchParam}`);
			
			if (response.status === 403) {
				router.push("/");
				return;
			}
			
			if (!response.ok) throw new Error("Failed to fetch users");
			const data = await response.json();
			setUsers(data.users);
			setTotal(data.total);
		} catch (err) {
			toast.error("Failed to load users");
		} finally {
			setIsLoading(false);
		}
	}, [currentPage, search, router]);

	useEffect(() => {
		setIsLoading(true);
		fetchUsers();
	}, [fetchUsers]);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		setSearch(searchInput);
		setCurrentPage(1);
	};

	const handleBan = async (userId: string) => {
		setBanningUser(userId);
		try {
			const response = await fetch(`/api/admin/users/${userId}/ban`, { method: "POST" });
			
			let parsed: { isBanned?: boolean; error?: string } | null = null;
			const contentType = response.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				try {
					parsed = await response.json();
				} catch {
					// JSON parse failed, will use text fallback
				}
			}
			
			if (!response.ok) {
				const errorText = parsed?.error || (await response.text().catch(() => "")) || "Failed to update ban status";
				throw new Error(errorText);
			}
			
			if (!parsed) {
				throw new Error("Invalid response from server");
			}
			
			setUsers((prev) =>
				prev.map((u) => (u.id === userId ? { ...u, isBanned: parsed!.isBanned ?? u.isBanned } : u))
			);
			toast.success(parsed.isBanned ? "User banned" : "User unbanned");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update ban status");
		} finally {
			setBanningUser(null);
		}
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString();
	};

	const hasMore = currentPage * USERS_PER_PAGE < total;

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
							<h1 className="text-xl font-extrabold">EditMash</h1>
							<Badge variant="destructive">Admin</Badge>
						</div>
					</div>
					<UserMenu />
				</div>
			</header>

			<main className="container mx-auto px-4 py-8">
				<div className="flex items-center justify-between mb-6">
					<h2 className="text-lg font-semibold flex items-center gap-2">
						<HugeiconsIcon icon={UserGroupIcon} className="w-5 h-5" />
						Users {total > 0 && `(${total})`}
					</h2>
					<form onSubmit={handleSearch} className="flex gap-2">
						<Input
							placeholder="Search users..."
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
							className="w-64"
						/>
						<Button type="submit" variant="secondary" size="icon">
							<HugeiconsIcon icon={Search01Icon} className="w-4 h-4" />
						</Button>
					</form>
				</div>

				{isLoading ? (
					<div className="flex items-center justify-center py-12">
						<div className="animate-pulse text-muted-foreground">Loading...</div>
					</div>
				) : users.length === 0 ? (
					<Card className="p-12 text-center">
						<div className="flex flex-col items-center gap-4">
							<HugeiconsIcon icon={UserGroupIcon} className="w-12 h-12 text-muted-foreground/50" />
							<p className="text-muted-foreground">No users found</p>
						</div>
					</Card>
				) : (
					<>
						<div className="space-y-2">
							{users.map((u) => (
								<Card key={u.id}>
									<CardContent className="p-4 flex items-center justify-between">
										<div className="flex items-center gap-4">
											<Avatar className="h-10 w-10">
												<AvatarImage src={u.image || undefined} alt={u.name} />
												<AvatarFallback>
													{u.name?.slice(0, 2).toUpperCase() || "??"}
												</AvatarFallback>
											</Avatar>
											<div>
												<div className="flex items-center gap-2">
													<span className="font-medium">{u.name}</span>
													{u.isAdmin && (
														<Badge variant="secondary">Admin</Badge>
													)}
													{u.isBanned && (
														<Badge variant="destructive">Banned</Badge>
													)}
												</div>
												<p className="text-sm text-muted-foreground">{u.email}</p>
												<p className="text-xs text-muted-foreground">
													Joined {formatDate(u.createdAt)}
												</p>
											</div>
										</div>
										<div className="flex items-center gap-2">
											{!u.isAdmin && (
												<Button
													variant={u.isBanned ? "outline" : "destructive"}
													size="sm"
													onClick={() => handleBan(u.id)}
													disabled={banningUser === u.id}
												>
													{banningUser === u.id
														? "..."
														: u.isBanned
														? "Unban"
														: "Ban"}
												</Button>
											)}
										</div>
									</CardContent>
								</Card>
							))}
						</div>

						{(currentPage > 1 || hasMore) && (
							<div className="mt-8">
								<Pagination>
									<PaginationContent>
										<PaginationItem>
											<Button
												variant="ghost"
												size="default"
												onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
												disabled={currentPage === 1 || isLoading}
												className="gap-1 px-2.5 sm:pl-2.5"
												aria-label="Go to previous page"
											>
												<HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />
												<span className="hidden sm:block">Previous</span>
											</Button>
										</PaginationItem>
										<PaginationItem>
											<span className="text-sm text-muted-foreground px-4">
												Page {currentPage}
											</span>
										</PaginationItem>
										<PaginationItem>
											<Button
												variant="ghost"
												size="default"
												onClick={() => setCurrentPage((p) => p + 1)}
												disabled={!hasMore || isLoading}
												className="gap-1 px-2.5 sm:pr-2.5"
												aria-label="Go to next page"
											>
												<span className="hidden sm:block">Next</span>
												<HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />
											</Button>
										</PaginationItem>
									</PaginationContent>
								</Pagination>
							</div>
						)}
					</>
				)}
			</main>
		</div>
	);
}
