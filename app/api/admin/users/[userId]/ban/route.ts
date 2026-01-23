import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
	const session = await auth.api.getSession({ headers: await headers() });

	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const currentUser = await db().select({ isAdmin: user.isAdmin }).from(user).where(eq(user.id, session.user.id)).limit(1);

	if (!currentUser[0]?.isAdmin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const { userId } = await params;

	if (userId === session.user.id) {
		return NextResponse.json({ error: "Cannot ban yourself" }, { status: 400 });
	}

	const targetUser = await db()
		.select({ id: user.id, isBanned: user.isBanned, isAdmin: user.isAdmin })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	if (!targetUser[0]) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	if (targetUser[0].isAdmin) {
		return NextResponse.json({ error: "Cannot ban an admin" }, { status: 400 });
	}

	const newBanStatus = !targetUser[0].isBanned;

	await db().update(user).set({ isBanned: newBanStatus }).where(eq(user.id, userId));

	return NextResponse.json({
		success: true,
		isBanned: newBanStatus,
	});
}
