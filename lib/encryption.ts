import CryptoJS from 'crypto-js';

if (!process.env.ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY is not set in environment variables');
}

const ENCRYPTION_KEY: string = process.env.ENCRYPTION_KEY;

export function encrypt(text: string): string {
  if (!text) return '';
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * Decrypts a value if it appears to be encrypted, otherwise returns it as-is.
 * Use this when reading from a column that may contain legacy plaintext from
 * before encryption was wired up. After a re-save, the value will be encrypted
 * and this function will decrypt it cleanly.
 */
export function safeDecrypt(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const decrypted = decrypt(value);
    // CryptoJS returns an empty string when decryption fails on garbage input;
    // treat that as "wasn't encrypted, leave alone".
    return decrypted || value;
  } catch {
    return value;
  }
}
