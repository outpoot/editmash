import { NextRequest, NextResponse } from "next/server";

const EARLY_ACCESS_PASSWORD = process.env.EARLY_ACCESS_PASSWORD;
const EARLY_ACCESS_COOKIE = "facedevisverycoolandshit";

export async function POST(request: NextRequest) {
	if (!EARLY_ACCESS_PASSWORD) {
		return NextResponse.json({ error: "Early access not configured" }, { status: 500 });
	}

	try {
		const { password } = await request.json();

		if (!password || typeof password !== "string") {
			return NextResponse.json({ error: "Password required" }, { status: 400 });
		}

		if (password !== EARLY_ACCESS_PASSWORD) {
			return NextResponse.json({ error: "Invalid password" }, { status: 401 });
		}

		const response = NextResponse.json({ success: true });

		response.cookies.set(EARLY_ACCESS_COOKIE, "true", {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 60 * 60 * 24 * 30,
			path: "/",
		});

		return response;
	} catch {
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
}
