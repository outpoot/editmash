import Redis from "ioredis";

const global = globalThis as unknown as {
	redisClient: Redis | undefined;
	redisConnectionLogged: boolean;
};

export function getRedis(): Redis {
	if (!global.redisClient) {
		const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

		global.redisClient = new Redis(redisUrl, {
			maxRetriesPerRequest: null,
			retryStrategy: (times) => {
				const delay = Math.min(times * 200, 30000);
				console.log(`Redis reconnection attempt ${times}, retrying in ${delay}ms...`);
				return delay;
			},
			lazyConnect: false,
			enableOfflineQueue: true,
			reconnectOnError: (err) => {
				console.log(`Redis error, will reconnect: ${err.message}`);
				return true;
			},
		});

		global.redisClient.on("error", (err) => {
			console.error("Redis connection error:", err.message);
		});

		global.redisClient.on("disconnect", () => {
			console.log("Disconnected from Redis");
		});

		global.redisClient.on("connect", () => {
			if (!global.redisConnectionLogged) {
				console.log("Connected to Redis");
				global.redisConnectionLogged = true;
			} else {
				console.log("Reconnected to Redis");
			}
		});

		global.redisClient.on("ready", () => {
			console.log("Redis ready");
		});
	}
	return global.redisClient;
}

export async function closeRedisConnection(): Promise<void> {
	if (global.redisClient) {
		await global.redisClient.quit();
		global.redisClient = undefined;
	}
	console.log("Redis connection closed");
}
