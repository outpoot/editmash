import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() });
	
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const currentUser = await db()
		.select({ 
			isAdmin: user.isAdmin,
			isBanned: user.isBanned 
		})
		.from(user)
		.where(eq(user.id, session.user.id))
		.limit(1);

	if (!currentUser[0]) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	return NextResponse.json({ 
		isAdmin: currentUser[0].isAdmin,
		isBanned: currentUser[0].isBanned
	});
}
