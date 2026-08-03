import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchSlug: string;
let memberAccessToken: string;
let fetchSpy: ReturnType<typeof vi.spyOn>;

function mockCompletionResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response;
}

beforeAll(async () => {
  process.env.OPENROUTER_API_KEY = "test-key";

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
  churchSlug = church.slug;

  const member = await User.create({
    churchId: church._id,
    name: "Membro Teste",
    email: "membro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  memberAccessToken = signAccessToken({
    sub: String(member._id),
    churchId: String(church._id),
    roles: ["member"],
  });
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

describe("POST /athos_adm/api/ai-chat/messages", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app)
      .post("/athos_adm/api/ai-chat/messages")
      .send({ sessionId: "s1", message: "Como funciona o mural?" });

    expect(response.status).toBe(401);
  });

  it("responde uma dúvida normal chamando o provedor de IA", async () => {
    fetchSpy.mockResolvedValueOnce(mockCompletionResponse("O mural mostra os posts da igreja."));

    const response = await request(app)
      .post("/athos_adm/api/ai-chat/messages")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ sessionId: "s1", message: "Como funciona o mural?" });

    expect(response.status).toBe(200);
    expect(response.body.data.category).toBe("system_question");
    expect(response.body.data.reply).toBe("O mural mostra os posts da igreja.");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("recusa e encaminha pedido de oração sem chamar o provedor de IA", async () => {
    const response = await request(app)
      .post("/athos_adm/api/ai-chat/messages")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ sessionId: "s2", message: "Preciso de oração pela minha família" });

    expect(response.status).toBe(200);
    expect(response.body.data.category).toBe("pastoral_care");
    expect(fetchSpy).not.toHaveBeenCalled();

    const { PastoralCareRequest } = await import("../models/PastoralCareRequest.model");
    const created = await PastoralCareRequest.findOne({ message: "Preciso de oração pela minha família" });
    expect(created).not.toBeNull();
  });

  it("valida mensagem vazia", async () => {
    const response = await request(app)
      .post("/athos_adm/api/ai-chat/messages")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ sessionId: "s1", message: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /athos_adm/api/public/churches/:slug/ai-chat/messages", () => {
  it("exige nome e whatsapp do visitante", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/public/churches/${churchSlug}/ai-chat/messages`)
      .send({ sessionId: "guest-1", message: "Como funciona o site?" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("responde a visitante anônimo sem exigir token", async () => {
    fetchSpy.mockResolvedValueOnce(mockCompletionResponse("Você pode ver os próximos eventos na home."));

    const response = await request(app)
      .post(`/athos_adm/api/public/churches/${churchSlug}/ai-chat/messages`)
      .send({
        sessionId: "guest-1",
        message: "Como funciona o site?",
        guestName: "Visitante",
        guestWhatsapp: "11999999999",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.category).toBe("system_question");
  });

  it("encaminha pedido de oração de visitante anônimo com nome e whatsapp", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/public/churches/${churchSlug}/ai-chat/messages`)
      .send({
        sessionId: "guest-2",
        message: "Gostaria de aconselhamento pastoral",
        guestName: "Visitante Dois",
        guestWhatsapp: "11988888888",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.category).toBe("pastoral_care");
    expect(fetchSpy).not.toHaveBeenCalled();

    const { PastoralCareRequest } = await import("../models/PastoralCareRequest.model");
    const created = await PastoralCareRequest.findOne({ guestName: "Visitante Dois" });
    expect(created).not.toBeNull();
    expect(created?.guestWhatsapp).toBe("11988888888");
  });
});
