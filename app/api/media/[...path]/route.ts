import { NextRequest, NextResponse } from "next/server";
import { downloadFromB2 } from "@/lib/b2";
import { ALL_ALLOWED_MIME_TYPES, getMimeTypeFromExtension } from "@/lib/validation";

const CACHE_MAX_AGE = 3600; // 1 hour
const ALLOWED_PREFIXES = ["media/", "renders/"];

function validatePath(fileName: string): { valid: boolean; error?: string } {
	if (!ALLOWED_PREFIXES.some((prefix) => fileName.startsWith(prefix))) {
		return { valid: false, error: "Invalid file path" };
	}

	if (fileName.includes("..") || fileName.includes("//")) {
		return { valid: false, error: "Invalid file path" };
	}

	const extension = fileName.split(".").pop()?.toLowerCase() || "";
	const contentType = getMimeTypeFromExtension(extension);

	if (!contentType || !ALL_ALLOWED_MIME_TYPES.has(contentType)) {
		return { valid: false, error: "File type not allowed" };
	}

	return { valid: true };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
	try {
		const { path } = await params;

		if (!path || path.length === 0) {
			return NextResponse.json({ error: "File path required" }, { status: 400 });
		}

		const fileName = path.join("/");

		const validation = validatePath(fileName);
		if (!validation.valid) {
			return NextResponse.json({ error: validation.error }, { status: 403 });
		}

		const extension = fileName.split(".").pop()?.toLowerCase() || "";
		const contentType = getMimeTypeFromExtension(extension);

		if (!contentType) {
			return NextResponse.json({ error: "Invalid content type" }, { status: 500 });
		}

		const rangeHeader = request.headers.get("range");

		const buffer = await downloadFromB2(fileName);

		if (rangeHeader) {
			const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
			if (matches) {
				const start = parseInt(matches[1], 10);
				const end = matches[2] ? parseInt(matches[2], 10) : buffer.length - 1;

				if (start < 0 || start >= buffer.length || end < start || end >= buffer.length) {
					return new NextResponse(null, {
						status: 416,
						headers: {
							"Content-Range": `bytes */${buffer.length}`,
						},
					});
				}

				const chunkSize = end - start + 1;
				const chunk = buffer.subarray(start, end + 1);

				return new NextResponse(new Uint8Array(chunk), {
					status: 206,
					headers: {
						"Content-Type": contentType,
						"Content-Length": chunkSize.toString(),
						"Content-Range": `bytes ${start}-${end}/${buffer.length}`,
						"Accept-Ranges": "bytes",
						"Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
						"X-Content-Type-Options": "nosniff",
					},
				});
			}
		}

		return new NextResponse(new Uint8Array(buffer), {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Content-Length": buffer.length.toString(),
				"Accept-Ranges": "bytes",
				"Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch (error) {
		console.error("Error serving media file:", error);

		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		if (errorMessage.includes("not found") || errorMessage.includes("404")) {
			return NextResponse.json({ error: "File not found" }, { status: 404 });
		}

		return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
	}
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
	try {
		const { path } = await params;

		if (!path || path.length === 0) {
			return new NextResponse(null, { status: 400 });
		}

		const fileName = path.join("/");

		const validation = validatePath(fileName);
		if (!validation.valid) {
			return new NextResponse(null, { status: 403 });
		}

		const extension = fileName.split(".").pop()?.toLowerCase() || "";
		const contentType = getMimeTypeFromExtension(extension);

		if (!contentType) {
			return new NextResponse(null, { status: 500 });
		}

		const buffer = await downloadFromB2(fileName);

		return new NextResponse(null, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Content-Length": buffer.length.toString(),
				"Accept-Ranges": "bytes",
				"Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
			},
		});
	} catch {
		return new NextResponse(null, { status: 404 });
	}
}
