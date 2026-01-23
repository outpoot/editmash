import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user, matches, matchMedia } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { deleteMultipleFromB2, deleteFileByName } from "@/lib/b2";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
	const session = await auth.api.getSession({ headers: await headers() });

	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const currentUser = await db().select({ isAdmin: user.isAdmin }).from(user).where(eq(user.id, session.user.id)).limit(1);

	if (!currentUser[0]?.isAdmin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const { matchId } = await params;

	const match = await db().select({ id: matches.id, renderUrl: matches.renderUrl }).from(matches).where(eq(matches.id, matchId)).limit(1);

	if (!match[0]) {
		return NextResponse.json({ error: "Match not found" }, { status: 404 });
	}

	const mediaFiles = await db()
		.select({ fileId: matchMedia.fileId, url: matchMedia.url })
		.from(matchMedia)
		.where(eq(matchMedia.matchId, matchId));

	const filesToDelete: Array<{ fileName: string; fileId: string }> = [];
	for (const media of mediaFiles) {
		if (media.fileId && media.url) {
			const urlMatch = media.url.match(/\/file\/[^/]+\/(.+)$/);
			if (urlMatch) {
				const fileName = decodeURIComponent(urlMatch[1]);
				filesToDelete.push({ fileName, fileId: media.fileId });
			}
		}
	}

	if (filesToDelete.length > 0) {
		try {
			await deleteMultipleFromB2(filesToDelete);
		} catch (error) {
			console.error("Error deleting media from B2:", error);
		}
	}

	if (match[0].renderUrl) {
		const renderMatch = match[0].renderUrl.match(/\/api\/media\/(.+)$/);
		if (renderMatch) {
			const renderFileName = decodeURIComponent(renderMatch[1]);
			try {
				await deleteFileByName(renderFileName);
			} catch (error) {
				console.error("Error deleting render from B2:", error);
			}
		}
	}

	await db().delete(matches).where(eq(matches.id, matchId));

	return NextResponse.json({ success: true });
}
