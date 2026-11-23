import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "./crypto.helper";

const original = process.env.TOKEN_ENCRYPTION_KEY;
afterEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = original;
});

describe("criptografia de tokens", () => {
  it("criptografa e descriptografa, com IV diferente a cada vez", () => {
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const a = encryptSecret("APP_USR-token-secreto");
    const b = encryptSecret("APP_USR-token-secreto");
    expect(a).not.toBe(b);
    expect(a).not.toContain("token-secreto");
    expect(decryptSecret(a)).toBe("APP_USR-token-secreto");
  });

  it("aceita chave em hex", () => {
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    expect(decryptSecret(encryptSecret("x"))).toBe("x");
  });

  it("detecta adulteração", () => {
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const parts = encryptSecret("valor").split(":");
    parts[3] = Buffer.from("outro").toString("base64url");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("falha com chave errada ou ausente", () => {
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const encrypted = encryptSecret("valor");
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    expect(() => decryptSecret(encrypted)).toThrow();
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });
});
