import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { user, session, account, lobbyPlayers, matchPlayers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { uploadToB2, deleteFileByName, listFileVersions } from "@/lib/b2";
import { processImage } from "@/lib/image";
import { getPlayerActiveMatch, getPlayerActiveLobby } from "@/lib/storage";
import { isNameAppropriate } from "@/lib/moderation";

export async function GET() {
	try {
		const currentSession = await getServerSession();
		if (!currentSession) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const db = getDb();
		const userData = await db.select().from(user).where(eq(user.id, currentSession.user.id)).limit(1);

		if (userData.length === 0) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		const activeMatch = await getPlayerActiveMatch(currentSession.user.id);
		const activeLobby = await getPlayerActiveLobby(currentSession.user.id);

		return NextResponse.json({ 
			user: userData[0],
			activeMatch,
			activeLobby,
		});
	} catch (error) {
		console.error("Error fetching user:", error);
		return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
	}
}

export async function PATCH(request: Request) {
	try {
		const currentSession = await getServerSession();
		if (!currentSession) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const contentType = request.headers.get("content-type") || "";
		const db = getDb();
		const userId = currentSession.user.id;

		if (contentType.includes("multipart/form-data")) {
			const formData = await request.formData();
			const file = formData.get("avatar") as File | null;

			if (!file) {
				return NextResponse.json({ error: "No file provided" }, { status: 400 });
			}

			const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
			if (!allowedTypes.includes(file.type)) {
				return NextResponse.json({ error: "Invalid file type. Allowed: JPEG, PNG, WebP" }, { status: 400 });
			}

			const maxSize = 5 * 1024 * 1024;
			if (file.size > maxSize) {
				return NextResponse.json({ error: "File too large. Maximum size is 5MB" }, { status: 400 });
			}

			const avatarPrefix = `avatars/${userId}`;
			let fileName: string | null = null;
			let proxyUrl: string | null = null;

			try {
				const buffer = Buffer.from(await file.arrayBuffer());
				const processed = await processImage(buffer);

				fileName = `avatars/${userId}-${Date.now()}.webp`;
				await uploadToB2(processed.buffer, fileName, processed.contentType);

				proxyUrl = `/api/media/${fileName}`;

				const updateResult = await db
					.update(user)
					.set({ image: proxyUrl })
					.where(eq(user.id, userId))
					.returning({ id: user.id, image: user.image });

				console.log("Avatar update result:", updateResult);

				if (updateResult.length === 0) {
					console.error("No rows updated for user:", userId);
					if (fileName) {
						try {
							await deleteFileByName(fileName);
						} catch (cleanupError) {
							console.error("Error cleaning up uploaded file:", cleanupError);
						}
					}
					return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
				}

				try {
					const oldFiles = await listFileVersions(avatarPrefix);
					for (const oldFile of oldFiles) {
						if (oldFile.fileName !== fileName) {
							await deleteFileByName(oldFile.fileName);
						}
					}
				} catch (error) {
					console.error("Error deleting old avatar files:", error);
				}

				return NextResponse.json({ success: true, image: proxyUrl });
			} catch (error) {
				console.error("Error uploading avatar:", error);
				if (fileName) {
					try {
						await deleteFileByName(fileName);
					} catch (cleanupError) {
						console.error("Error cleaning up uploaded file:", cleanupError);
					}
				}
				return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to upload avatar" }, { status: 500 });
			}
		}

		const body = await request.json();
		const { name, highlightColor, tutorialCompleted } = body;

		if (name !== undefined) {
			if (typeof name !== "string") {
				return NextResponse.json({ error: "Name must be a string" }, { status: 400 });
			}

			const trimmedName = name.trim();
			if (trimmedName.length < 1 || trimmedName.length > 100) {
				return NextResponse.json({ error: "Name must be between 1 and 100 characters" }, { status: 400 });
			}

			const isAppropriate = await isNameAppropriate(trimmedName);
			if (!isAppropriate) {
				return NextResponse.json({ error: "Name contains inappropriate content" }, { status: 400 });
			}

			await db.update(user).set({ name: trimmedName }).where(eq(user.id, userId));
		}

		if (highlightColor !== undefined) {
			if (typeof highlightColor !== "string") {
				return NextResponse.json({ error: "Highlight color must be a string" }, { status: 400 });
			}

			if (!/^#[0-9A-Fa-f]{6}$/.test(highlightColor)) {
				return NextResponse.json({ error: "Highlight color must be a valid hex color (e.g., #3b82f6)" }, { status: 400 });
			}

			await db.update(user).set({ highlightColor }).where(eq(user.id, userId));
		}

		if (tutorialCompleted !== undefined) {
			if (typeof tutorialCompleted !== "boolean") {
				return NextResponse.json({ error: "tutorialCompleted must be a boolean" }, { status: 400 });
			}

			await db.update(user).set({ tutorialCompleted }).where(eq(user.id, userId));
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error updating user:", error);
		return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
	}
}

export async function DELETE() {
	try {
		const currentSession = await getServerSession();
		if (!currentSession) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const db = getDb();
		const userId = currentSession.user.id;

		try {
			const avatarFiles = await listFileVersions(`avatars/${userId}`);
			for (const file of avatarFiles) {
				await deleteFileByName(file.fileName);
			}
		} catch (error) {
			console.error("Error deleting avatar:", error);
		}

		await db.transaction(async (tx) => {
			await tx.delete(lobbyPlayers).where(eq(lobbyPlayers.userId, userId));
			await tx.delete(matchPlayers).where(eq(matchPlayers.userId, userId));
			await tx.delete(session).where(eq(session.userId, userId));
			await tx.delete(account).where(eq(account.userId, userId));
			await tx.delete(user).where(eq(user.id, userId));
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error deleting user:", error);
		return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
	}
}
