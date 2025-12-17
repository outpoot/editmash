import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | null = null;

function getPool(): Pool {
	if (!pool) {
		const connectionString = process.env.DATABASE_URL;

		if (!connectionString) {
			throw new Error("DATABASE_URL environment variable is not set.");
		}

		pool = new Pool({
			connectionString,
			max: 20,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 10000,
		});

		pool.on("error", (err) => {
			console.error("Unexpected error on idle client", err);
		});
	}

	return pool;
}

export function getDb() {
	return drizzle(getPool(), { schema });
}

let dbInstance: ReturnType<typeof getDb> | null = null;

export function db() {
	if (!dbInstance) {
		dbInstance = getDb();
	}
	return dbInstance;
}

export async function closeDb(): Promise<void> {
	if (pool) {
		await pool.end();
		pool = null;
		dbInstance = null;
	}
}

export async function checkDbConnection(): Promise<boolean> {
	try {
		const pool = getPool();
		const client = await pool.connect();
		await client.query("SELECT 1");
		client.release();
		return true;
	} catch (error) {
		console.error("Database connection check failed:", error);
		return false;
	}
}

export * from "./schema";
