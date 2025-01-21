import Redis from "ioredis";

let redis: Redis | null = null;

export const getRedis = (): Redis => {
  if (!redis) {
    const REDIS_URL = process.env.REDIS_URL + "?family=0";
    if (!REDIS_URL) {
      throw new Error("REDIS_URL is not set");
    }
    redis = new Redis(REDIS_URL);
  }
  return redis;
};
