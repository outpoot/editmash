import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const EARLY_ACCESS_COOKIE = "facedevisverycoolandshit";

export function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (pathname.startsWith("/api")) {
		return NextResponse.next();
	}

	const host = request.headers.get("host") || "";
	const isInternalRequest = host.includes("app:3000") || host.includes("localhost:3000");
	
	if (isInternalRequest) {
		return NextResponse.next();
	}

	if (pathname === "/early-access") {
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/")) {
		return NextResponse.next();
	}

	if (
		pathname.startsWith("/_next") ||
		pathname.startsWith("/favicon") ||
		pathname.endsWith(".svg") ||
		pathname.endsWith(".png") ||
		pathname.endsWith(".jpg") ||
		pathname.endsWith(".ico")
	) {
		return NextResponse.next();
	}

	const hasAccess = request.cookies.get(EARLY_ACCESS_COOKIE)?.value === "true";

	if (!hasAccess) {
		return NextResponse.redirect(new URL("/early-access", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image).*)"],
};
