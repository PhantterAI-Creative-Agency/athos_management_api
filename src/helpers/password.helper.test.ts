import { describe, expect, it } from "vitest";
import { comparePassword, hashPassword } from "./password.helper";

describe("password.helper", () => {
  it("gera um hash diferente do texto original e valida a senha correta", async () => {
    const hash = await hashPassword("supersecret");

    expect(hash).not.toBe("supersecret");
    await expect(comparePassword("supersecret", hash)).resolves.toBe(true);
  });

  it("rejeita uma senha incorreta contra o hash", async () => {
    const hash = await hashPassword("supersecret");

    await expect(comparePassword("wrong-password", hash)).resolves.toBe(false);
  });
});
