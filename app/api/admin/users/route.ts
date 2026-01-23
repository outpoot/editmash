import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { desc, sql, ilike, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() });

	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const currentUser = await db()
		.select({ isAdmin: user.isAdmin })
		.from(user)
		.where(sql`${user.id} = ${session.user.id}`)
		.limit(1);

	if (!currentUser[0]?.isAdmin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const searchParams = request.nextUrl.searchParams;
	const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
	const offset = parseInt(searchParams.get("offset") || "0");
	const search = searchParams.get("search") || "";

	let query = db()
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			isAdmin: user.isAdmin,
			isBanned: user.isBanned,
			createdAt: user.createdAt,
		})
		.from(user)
		.orderBy(desc(user.createdAt))
		.limit(limit)
		.offset(offset);

	if (search) {
		query = query.where(or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))) as typeof query;
	}

	const users = await query;

	let countQuery = db()
		.select({ count: sql<number>`count(*)::int` })
		.from(user);

	if (search) {
		countQuery = countQuery.where(or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))) as typeof countQuery;
	}

	const totalResult = await countQuery;
	const total = totalResult[0]?.count || 0;

	return NextResponse.json({ users, total });
}
