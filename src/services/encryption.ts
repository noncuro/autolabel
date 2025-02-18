import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export const encrypt = (text: string): string => {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  // Generate a random initialization vector
  const iv = randomBytes(IV_LENGTH);

  // Create cipher with key, iv
  const cipher = createCipheriv(
    ALGORITHM,
    Buffer.from(process.env.ENCRYPTION_KEY, "hex"),
    iv
  );

  // Encrypt the text
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Return iv:authTag:encrypted
  // We'll prepend the IV and auth tag so we can use them for decryption
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
};

export const decrypt = (encryptedText: string): string => {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  // Convert the encrypted text to a buffer
  const encryptedBuffer = Buffer.from(encryptedText, "base64");

  // Extract the IV, auth tag, and encrypted content
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  // Create decipher
  const decipher = createDecipheriv(
    ALGORITHM,
    Buffer.from(process.env.ENCRYPTION_KEY, "hex"),
    iv
  );

  // Set auth tag
  decipher.setAuthTag(authTag);

  // Decrypt the text
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}; 