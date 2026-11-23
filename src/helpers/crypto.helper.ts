import crypto from "node:crypto";
import { AppError } from "../middlewares/errorHandler";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

/**
 * Chave de 32 bytes (base64 ou hex) em TOKEN_ENCRYPTION_KEY. Lida a cada uso para permitir
 * troca em testes; nunca é registrada em log.
 */
function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new AppError(500, "ENCRYPTION_KEY_MISSING", "TOKEN_ENCRYPTION_KEY não configurada");
  }
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new AppError(500, "ENCRYPTION_KEY_INVALID", "TOKEN_ENCRYPTION_KEY deve ter 32 bytes (base64 ou hex)");
  }
  return key;
}

export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Criptografa um segredo (AES-256-GCM). Formato: v1:iv:tag:dados, em base64url. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !data) {
    throw new AppError(500, "ENCRYPTED_VALUE_INVALID", "Valor criptografado em formato inválido");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Assina um valor com HMAC-SHA256 (para o `state` do OAuth). */
export function signValue(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
