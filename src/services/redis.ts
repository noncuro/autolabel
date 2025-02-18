import Redis from "ioredis";
import { encrypt, decrypt } from "./encryption";

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

interface GmailCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

export const getAllGmailCredentials = async (): Promise<Array<{ email: string; credentials: GmailCredentials }>> => {
  const redis = getRedis();
  const keys = await redis.keys("gmail-credentials:*");
  
  const credentials = await Promise.all(
    keys.map(async (key) => {
      const value = await redis.get(key);
      if (!value) return null;
      
      try {
        const decryptedValue = decrypt(value);
        return {
          email: key.replace("gmail-credentials:", ""),
          credentials: JSON.parse(decryptedValue)
        };
      } catch (error) {
        console.error(`Failed to decrypt credentials for ${key}:`, error);
        return null;
      }
    })
  );

  return credentials.filter((cred): cred is NonNullable<typeof cred> => cred !== null);
};

export const saveGmailCredentials = async (email: string, credentials: GmailCredentials): Promise<void> => {
  const redis = getRedis();
  const encryptedValue = encrypt(JSON.stringify(credentials));
  
  await redis.set(
    `gmail-credentials:${email}`,
    encryptedValue,
    "EX",
    60 * 60 * 24 * 30 // 30 days
  );
};

export const getGmailCredentials = async (email: string): Promise<GmailCredentials | null> => {
  const redis = getRedis();
  const value = await redis.get(`gmail-credentials:${email}`);
  
  if (!value) return null;
  
  try {
    const decryptedValue = decrypt(value);
    return JSON.parse(decryptedValue);
  } catch (error) {
    console.error(`Failed to decrypt credentials for ${email}:`, error);
    return null;
  }
};
