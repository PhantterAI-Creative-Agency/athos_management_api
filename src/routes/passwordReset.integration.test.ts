import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

// Os limiters são cobertos em outros testes; aqui várias tentativas seguidas são esperadas.
vi.mock("../middlewares/rateLimiter", async (importOriginal) => {
  const original = await importOriginal<typeof import("../middlewares/rateLimiter")>();
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return Object.fromEntries(Object.keys(original).map((key) => [key, passthrough]));
});

let mongod: MongoMemoryServer;
let app: Express;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { hashPassword } = await import("../helpers/password.helper");

  await connectDB(process.env.MONGODB_URI);
  app = createApp();

  const church = await Church.create({
    name: "Igreja Teste",
    logoUrl: "https://example.com/logo.png",
    slug: "igreja-teste",
    settings: { primaryColor: "#123456" },
  });

  await User.create({
    churchId: church._id,
    name: "Membro Teste",
    email: "membro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("recuperação de senha", () => {
  async function seedResetCode(email: string, code: string, expiresInMs = 60_000) {
    const { User } = await import("../models/User.model");
    const { hashPassword } = await import("../helpers/password.helper");
    await User.updateOne(
      { email },
      {
        passwordResetCodeHash: await hashPassword(code),
        passwordResetExpiresAt: new Date(Date.now() + expiresInMs),
        passwordResetAttempts: 0,
      },
    );
  }

  it("forgot-password responde 200 tanto para e-mail existente quanto inexistente", async () => {
    const known = await request(app).post("/athos_adm/api/auth/forgot-password").send({ email: "membro@teste.com" });
    const unknown = await request(app).post("/athos_adm/api/auth/forgot-password").send({ email: "naoexiste@teste.com" });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });

  it("forgot-password grava um código de 6 dígitos com hash", async () => {
    const { User } = await import("../models/User.model");
    await request(app).post("/athos_adm/api/auth/forgot-password").send({ email: "membro@teste.com" });

    const user = await User.findOne({ email: "membro@teste.com" }).select("+passwordResetCodeHash +passwordResetExpiresAt");
    expect(user?.passwordResetCodeHash).toBeTruthy();
    expect(user?.passwordResetCodeHash).not.toMatch(/^\d{6}$/);
    expect(user!.passwordResetExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("reset-password troca a senha com código válido e invalida o código", async () => {
    await seedResetCode("membro@teste.com", "123456");

    const reset = await request(app)
      .post("/athos_adm/api/auth/reset-password")
      .send({ email: "membro@teste.com", code: "123456", password: "novaSenha123" });
    expect(reset.status).toBe(204);

    const oldLogin = await request(app)
      .post("/athos_adm/api/auth/login")
      .send({ email: "membro@teste.com", password: "senha123" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/athos_adm/api/auth/login")
      .send({ email: "membro@teste.com", password: "novaSenha123" });
    expect(newLogin.status).toBe(200);

    const reuse = await request(app)
      .post("/athos_adm/api/auth/reset-password")
      .send({ email: "membro@teste.com", code: "123456", password: "outraSenha123" });
    expect(reuse.status).toBe(400);
  });

  it("rejeita código errado, expirado e bloqueia após 5 tentativas", async () => {
    await seedResetCode("membro@teste.com", "654321");
    const wrong = await request(app)
      .post("/athos_adm/api/auth/reset-password")
      .send({ email: "membro@teste.com", code: "000000", password: "novaSenha123" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("INVALID_RESET_CODE");

    await seedResetCode("membro@teste.com", "654321", -1000);
    const expired = await request(app)
      .post("/athos_adm/api/auth/reset-password")
      .send({ email: "membro@teste.com", code: "654321", password: "novaSenha123" });
    expect(expired.status).toBe(400);

    await seedResetCode("membro@teste.com", "654321");
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/athos_adm/api/auth/reset-password")
        .send({ email: "membro@teste.com", code: "000000", password: "novaSenha123" });
    }
    const locked = await request(app)
      .post("/athos_adm/api/auth/reset-password")
      .send({ email: "membro@teste.com", code: "654321", password: "novaSenha123" });
    expect(locked.status).toBe(400);
  });

  it("valida formato do código e tamanho da senha", async () => {
    const badCode = await request(app)
      .post("/athos_adm/api/auth/reset-password")
      .send({ email: "membro@teste.com", code: "12ab", password: "novaSenha123" });
    expect(badCode.status).toBe(400);

    const shortPassword = await request(app)
      .post("/athos_adm/api/auth/reset-password")
      .send({ email: "membro@teste.com", code: "123456", password: "curta" });
    expect(shortPassword.status).toBe(400);
  });
});

describe("POST /athos_adm/api/auth/change-password", () => {
  it("exige autenticação", async () => {
    const response = await request(app).post("/athos_adm/api/auth/change-password").send({ password: "novaSenha456" });
    expect(response.status).toBe(401);
  });

  it("troca a senha do usuário logado sem exigir a senha atual", async () => {
    const { User } = await import("../models/User.model");
    const { hashPassword } = await import("../helpers/password.helper");
    await User.updateOne({ email: "membro@teste.com" }, { passwordHash: await hashPassword("senha123") });

    const login = await request(app)
      .post("/athos_adm/api/auth/login")
      .send({ email: "membro@teste.com", password: "senha123" });
    const token = login.body.data.accessToken;

    const short = await request(app)
      .post("/athos_adm/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "curta" });
    expect(short.status).toBe(400);

    const change = await request(app)
      .post("/athos_adm/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "novaSenha456" });
    expect(change.status).toBe(204);

    const relogin = await request(app)
      .post("/athos_adm/api/auth/login")
      .send({ email: "membro@teste.com", password: "novaSenha456" });
    expect(relogin.status).toBe(200);
  });
});
