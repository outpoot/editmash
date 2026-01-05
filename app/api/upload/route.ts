import { NextRequest, NextResponse } from "next/server";
import { uploadToB2 } from "@/lib/b2";
import { validateFile, getFileExtension } from "@/lib/validation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function POST(request: NextRequest) {
	try {
		const session = await auth.api.getSession({ headers: await headers() });
		if (!session?.user) {
			return NextResponse.json({ error: "Authentication required" }, { status: 401 });
		}

		const formData = await request.formData();
		const file = formData.get("file") as File;

		if (!file) {
			return NextResponse.json({ error: "No file provided" }, { status: 400 });
		}

		const validation = validateFile({
			name: file.name,
			size: file.size,
			type: file.type,
		});

		if (!validation.valid) {
			return NextResponse.json({ error: validation.message }, { status: 400 });
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const timestamp = Date.now();
		const randomString = Math.random().toString(36).substring(7);
		const extension = getFileExtension(file.name);
		const fileName = `media/${timestamp}_${randomString}.${extension}`;

		const uploadedFile = await uploadToB2(buffer, fileName, file.type);

		return NextResponse.json({
			url: uploadedFile.url,
			fileId: uploadedFile.fileId,
			fileName: uploadedFile.fileName,
			contentType: uploadedFile.contentType,
			size: uploadedFile.contentLength,
		});
	} catch (error) {
		console.error("Error uploading file:", error);
		const errorMessage = error instanceof Error ? error.message : "Failed to upload file";
		return NextResponse.json({ error: errorMessage }, { status: 500 });
	}
}
