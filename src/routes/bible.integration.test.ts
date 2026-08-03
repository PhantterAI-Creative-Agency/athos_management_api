import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let memberAccessToken: string;
let fetchSpy: ReturnType<typeof vi.spyOn>;

function mockChapterResponse(overrides: { verses?: { number: number; text: string }[] } = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      book: { abbrev: { pt: "gn" }, name: "Gênesis" },
      chapter: { number: 1 },
      verses: overrides.verses ?? [{ number: 1, text: "No princípio, Deus criou os céus e a terra." }],
    }),
  } as Response;
}

beforeAll(async () => {
  process.env.BIBLE_API_TOKEN = "test-token";

  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { hashPassword } = await import("../helpers/password.helper");
  const { signAccessToken } = await import("../helpers/jwt.helper");

  await connectDB(process.env.MONGODB_URI);
  app = createApp();

  const church = await Church.create({
    name: "Igreja Teste",
    logoUrl: "https://example.com/logo.png",
    slug: "igreja-teste",
    settings: { primaryColor: "#123456" },
  });

  const member = await User.create({
    churchId: church._id,
    name: "Membro Teste",
    email: "membro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  memberAccessToken = signAccessToken({ sub: String(member._id), churchId: String(church._id), roles: ["member"] });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("GET /athos_adm/api/bible/:book/:chapter", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/bible/gn/1");

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("valida capítulo não numérico", async () => {
    const response = await request(app)
      .get("/athos_adm/api/bible/gn/abc")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("retorna o capítulo consultando a API bíblica externa", async () => {
    fetchSpy.mockResolvedValueOnce(mockChapterResponse());

    const response = await request(app)
      .get("/athos_adm/api/bible/gn/1?version=nvi")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      book: { abbrev: "gn", name: "Gênesis" },
      version: "nvi",
      chapter: 1,
      verses: [{ number: 1, text: "No princípio, Deus criou os céus e a terra." }],
    });

    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/verses/nvi/gn/1");
    expect((calledOptions.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("usa cache em memória para a mesma versão/livro/capítulo (não chama a API de novo)", async () => {
    fetchSpy.mockResolvedValueOnce(mockChapterResponse());

    const first = await request(app)
      .get("/athos_adm/api/bible/gn/2?version=nvi")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    const second = await request(app)
      .get("/athos_adm/api/bible/gn/2?version=nvi")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retorna 404 quando a API externa não encontra o capítulo", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response);

    const response = await request(app)
      .get("/athos_adm/api/bible/xx/999?version=nvi")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("BIBLE_CHAPTER_NOT_FOUND");
  });

  it("retorna 502 quando a API externa falha", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response);

    const response = await request(app)
      .get("/athos_adm/api/bible/xx/998?version=nvi")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("BIBLE_API_ERROR");
  });

  it("retorna 503 quando BIBLE_API_TOKEN não está configurado", async () => {
    const { env } = await import("../config/env");
    const originalToken = env.BIBLE_API_TOKEN;
    env.BIBLE_API_TOKEN = undefined;

    const response = await request(app)
      .get("/athos_adm/api/bible/xx/997?version=nvi")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    env.BIBLE_API_TOKEN = originalToken;

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("BIBLE_API_NOT_CONFIGURED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
