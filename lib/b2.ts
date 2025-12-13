import B2 from "backblaze-b2";

const B2_KEY_ID = process.env.B2_KEY_ID || "";
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || "";
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || "";
const B2_BUCKET_ID = process.env.B2_BUCKET_ID || null;

interface AuthData {
	authorizationToken: string;
	apiUrl: string;
	downloadUrl: string;
	expiresAt: number;
}

interface B2ClientData {
	b2: B2;
	auth: AuthData;
}

let b2Instance: B2 | null = null;
let authData: AuthData | null = null;
let bucketId: string | null = B2_BUCKET_ID;
let initializingPromise: Promise<B2ClientData> | null = null;

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function isTokenExpired(): boolean {
	if (!authData) return true;
	const now = Date.now();
	return now >= authData.expiresAt - REFRESH_BUFFER_MS;
}

async function initializeB2Client(): Promise<B2ClientData> {
	const newB2Instance = new B2({
		applicationKeyId: B2_KEY_ID,
		applicationKey: B2_APPLICATION_KEY,
	});

	try {
		const authResponse = await newB2Instance.authorize();
		const newAuthData: AuthData = {
			authorizationToken: authResponse.data.authorizationToken,
			apiUrl: authResponse.data.apiUrl,
			downloadUrl: authResponse.data.downloadUrl,
			expiresAt: Date.now() + TOKEN_LIFETIME_MS,
		};

		b2Instance = newB2Instance;
		authData = newAuthData;

		console.log(`B2 authorized, token expires at ${new Date(newAuthData.expiresAt).toISOString()}`);

		return { b2: newB2Instance, auth: newAuthData };
	} catch (error) {
		b2Instance = null;
		authData = null;
		initializingPromise = null;
		console.error("B2 Authorization failed:", error);
		throw new Error("Failed to authenticate with Backblaze B2. Please check your credentials.");
	}
}

async function getB2Client(forceRefresh = false): Promise<B2ClientData> {
	if (!forceRefresh && b2Instance && authData && !isTokenExpired()) {
		return { b2: b2Instance, auth: authData };
	}

	if (initializingPromise) {
		return initializingPromise;
	}

	initializingPromise = initializeB2Client();

	try {
		const result = await initializingPromise;
		return result;
	} finally {
		initializingPromise = null;
	}
}

async function getBucketId(): Promise<string> {
	if (bucketId) {
		return bucketId;
	}

	const { b2 } = await getB2Client();

	try {
		const bucketResponse = await b2.getBucket({ bucketName: B2_BUCKET_NAME });
		const bucket = bucketResponse.data.buckets.find((b: { bucketName: string; bucketId: string }) => b.bucketName === B2_BUCKET_NAME);

		if (bucket) {
			bucketId = bucket.bucketId;
			console.log(`Found bucket: ${B2_BUCKET_NAME} (${bucketId})`);
			return bucket.bucketId;
		}
	} catch (error) {
		console.error("Error getting bucket:", error);
	}

	throw new Error(`Bucket not found: ${B2_BUCKET_NAME}`);
}

export interface UploadedFile {
	fileId: string;
	fileName: string;
	url: string;
	contentType: string;
	contentLength: number;
}

export async function uploadToB2(
	buffer: Buffer,
	fileName: string,
	contentType: string,
	onProgress?: (progress: number) => void
): Promise<UploadedFile> {
	const { b2, auth } = await getB2Client();
	const currentBucketId = await getBucketId();

	const uploadUrlResponse = await b2.getUploadUrl({ bucketId: currentBucketId });
	const { uploadUrl, authorizationToken } = uploadUrlResponse.data;

	if (onProgress) {
		onProgress(0);
	}

	const uploadResponse = await b2.uploadFile({
		uploadUrl,
		uploadAuthToken: authorizationToken,
		fileName,
		data: buffer,
		contentLength: buffer.length,
		mime: contentType,
		onUploadProgress: (event: { loaded?: number; total?: number }) => {
			if (onProgress && event.loaded !== undefined && event.total !== undefined && event.total > 0) {
				const progressPercent = (event.loaded / event.total) * 100;
				onProgress(progressPercent);
			}
		},
	});

	if (onProgress) {
		onProgress(100);
	}

	const fileId = uploadResponse.data.fileId;
	const uploadedFileName = uploadResponse.data.fileName;

	const downloadUrl = `${auth.downloadUrl}/file/${B2_BUCKET_NAME}/${encodeURIComponent(uploadedFileName)}`;

	return {
		fileId,
		fileName: uploadedFileName,
		url: downloadUrl,
		contentType,
		contentLength: buffer.length,
	};
}

export async function downloadFromB2(fileName: string): Promise<Buffer> {
	const { b2 } = await getB2Client();

	const response = await b2.downloadFileByName({
		bucketName: B2_BUCKET_NAME,
		fileName,
		responseType: "arraybuffer",
	});

	return Buffer.from(response.data);
}

export async function deleteFromB2(fileName: string, fileId: string): Promise<void> {
	const { b2 } = await getB2Client();

	await b2.deleteFileVersion({
		fileId,
		fileName,
	});
}

export interface DeleteResult {
	fileName: string;
	fileId: string;
	success: boolean;
	error?: string;
}

export async function deleteMultipleFromB2(files: Array<{ fileName: string; fileId: string }>): Promise<DeleteResult[]> {
	const { b2 } = await getB2Client();
	const results: DeleteResult[] = [];

	for (const file of files) {
		try {
			await b2.deleteFileVersion({
				fileId: file.fileId,
				fileName: file.fileName,
			});
			results.push({
				fileName: file.fileName,
				fileId: file.fileId,
				success: true,
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`Error deleting file ${file.fileName}:`, errorMessage);
			results.push({
				fileName: file.fileName,
				fileId: file.fileId,
				success: false,
				error: errorMessage,
			});
		}
	}

	return results;
}

export async function getB2DownloadUrl(fileName: string): Promise<string> {
	const { auth } = await getB2Client();
	return `${auth.downloadUrl}/file/${B2_BUCKET_NAME}/${encodeURIComponent(fileName)}`;
}
