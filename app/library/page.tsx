"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowLeft02Icon, ArrowRight02Icon, FavouriteIcon, Calendar03Icon, UserGroupIcon, Video01Icon } from "@hugeicons/core-free-icons";
import { UserMenu } from "../components/UserMenu";

interface LibraryVideo {
	id: string;
	joinCode: string;
	lobbyName: string;
	renderUrl: string;
	completedAt: string;
	editCount: number;
	timelineDuration: number;
	likeCount: number;
	liked: boolean;
	playerCount: number;
}

const VIDEOS_PER_PAGE = 20;

export default function LibraryPage() {
	const router = useRouter();
	const [videos, setVideos] = useState<LibraryVideo[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [sortBy, setSortBy] = useState<"date" | "likes">("date");
	const [currentPage, setCurrentPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);

	const fetchVideos = useCallback(async () => {
		try {
			const offset = (currentPage - 1) * VIDEOS_PER_PAGE;
			const response = await fetch(`/api/library?sort=${sortBy}&limit=${VIDEOS_PER_PAGE}&offset=${offset}`);
			if (!response.ok) throw new Error("Failed to fetch library");
			const data = await response.json();
			setVideos(data.videos);
			setHasMore(data.videos.length === VIDEOS_PER_PAGE);
		} catch (err) {
			toast.error("Failed to load library");
		} finally {
			setIsLoading(false);
		}
	}, [sortBy, currentPage]);

	useEffect(() => {
		setIsLoading(true);
		fetchVideos();
	}, [fetchVideos]);

	useEffect(() => {
		setCurrentPage(1);
	}, [sortBy]);

	const handleLike = async (matchId: string, e: React.MouseEvent) => {
		e.stopPropagation();

		const video = videos.find((v) => v.id === matchId);
		if (!video) return;

		const newLiked = !video.liked;
		const newLikeCount = video.likeCount + (newLiked ? 1 : -1);
		setVideos((prev) => prev.map((v) => (v.id === matchId ? { ...v, liked: newLiked, likeCount: newLikeCount } : v)));

		try {
			const response = await fetch(`/api/library/${matchId}/like`, { method: "POST" });
			if (!response.ok) {
				setVideos((prev) => prev.map((v) => (v.id === matchId ? { ...v, liked: video.liked, likeCount: video.likeCount } : v)));
				if (response.status === 401) {
					toast.error("Please sign in to like videos");
					return;
				}
				throw new Error("Failed to like");
			}
			const data = await response.json();
			setVideos((prev) => prev.map((v) => (v.id === matchId ? { ...v, liked: data.liked, likeCount: data.likeCount } : v)));
		} catch (err) {
			setVideos((prev) => prev.map((v) => (v.id === matchId ? { ...v, liked: video.liked, likeCount: video.likeCount } : v)));
			toast.error("Failed to like video");
		}
	};

	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffHours < 1) return "Just now";
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	};

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
							<span className="text-xs font-medium text-muted-foreground">Library</span>
						</div>
					</div>

					<UserMenu />
				</div>
			</header>

			<main className="container mx-auto px-4 py-8">
				<div className="flex items-center justify-between mb-6">
					<h2 className="text-lg font-semibold">All Videos {videos.length > 0 && `(${videos.length})`}</h2>
					<Tabs value={sortBy} onValueChange={(v) => setSortBy(v as "date" | "likes")}>
						<TabsList>
							<TabsTrigger value="date" className="gap-1.5">
								<HugeiconsIcon icon={Calendar03Icon} className="w-4 h-4" />
								Recent
							</TabsTrigger>
							<TabsTrigger value="likes" className="gap-1.5">
								<HugeiconsIcon icon={FavouriteIcon} className="w-4 h-4" />
								Popular
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				{isLoading ? (
					<div className="flex items-center justify-center py-12">
						<div className="animate-pulse text-muted-foreground">Loading...</div>
					</div>
				) : videos.length === 0 ? (
					<Card className="p-12 text-center">
						<div className="flex flex-col items-center gap-4">
							<HugeiconsIcon icon={Video01Icon} className="w-12 h-12 text-muted-foreground/50" />
							<div>
								<p className="text-muted-foreground">No videos yet</p>
								<p className="text-sm text-muted-foreground/70">Completed matches will appear here</p>
							</div>
						</div>
					</Card>
				) : (
					<>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{videos.map((video) => (
								<VideoCard key={video.id} video={video} onLike={handleLike} formatDate={formatDate} />
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
											<span className="text-sm text-muted-foreground px-4">Page {currentPage}</span>
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

function VideoCard({
	video,
	onLike,
	formatDate,
}: {
	video: LibraryVideo;
	onLike: (matchId: string, e: React.MouseEvent) => void;
	formatDate: (date: string) => string;
}) {
	const router = useRouter();

	return (
		<Card
			className="overflow-hidden hover:border-primary/20 transition-colors cursor-pointer group"
			onClick={() => router.push(`/results/${video.joinCode}`)}
		>
			<div className="aspect-video bg-black relative">
				<video
					src={video.renderUrl}
					className="w-full h-full object-cover"
					muted
					playsInline
					onMouseEnter={(e) => e.currentTarget.play()}
					onMouseLeave={(e) => {
						e.currentTarget.pause();
						e.currentTarget.currentTime = 0;
					}}
				/>
				<div className="absolute bottom-2 right-2">
					<Badge variant="secondary" className="bg-black/70 text-white text-xs">
						{video.timelineDuration}s
					</Badge>
				</div>
			</div>
			<CardContent className="p-3">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<h3 className="font-semibold text-sm truncate">{video.lobbyName}</h3>
						<div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
							<span className="flex items-center gap-1">
								<HugeiconsIcon icon={UserGroupIcon} className="w-3 h-3" />
								{video.playerCount}
							</span>
							<span>{video.editCount} edits</span>
							<span>{formatDate(video.completedAt)}</span>
						</div>
					</div>
					<button
						onClick={(e) => onLike(video.id, e)}
						className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
							video.liked
								? "bg-pink-500/20 text-pink-500 hover:bg-pink-500/30"
								: "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-pink-500"
						}`}
					>
						<HugeiconsIcon icon={FavouriteIcon} className="w-3.5 h-3.5" fill={video.liked ? "currentColor" : "none"} />
						{video.likeCount}
					</button>
				</div>
			</CardContent>
		</Card>
	);
}
