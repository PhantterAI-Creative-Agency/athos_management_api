import { describe, expect, it } from "vitest";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "./jwt.helper";

const payload = { sub: "user-id", churchId: "church-id", roles: ["member" as const] };

describe("jwt.helper", () => {
  it("assina e verifica um access token", () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.churchId).toBe(payload.churchId);
    expect(decoded.roles).toEqual(payload.roles);
  });

  it("assina e verifica um refresh token", () => {
    const token = signRefreshToken(payload);
    const decoded = verifyRefreshToken(token);

    expect(decoded.sub).toBe(payload.sub);
  });

  it("rejeita um access token verificado como refresh token", () => {
    const token = signAccessToken(payload);

    expect(() => verifyRefreshToken(token)).toThrow();
  });
});
