import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

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

  await User.create({
    churchId: church._id,
    name: "Membro Inativo",
    email: "inativo@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
    active: false,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/auth/login", () => {
  it("autentica com credenciais válidas e retorna tokens", async () => {
    const response = await request(app).post("/athos_adm/api/auth/login").send({
      email: "membro@teste.com",
      password: "senha123",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(response.body.data.user.email).toBe("membro@teste.com");
  });

  it("rejeita senha incorreta", async () => {
    const response = await request(app).post("/athos_adm/api/auth/login").send({
      email: "membro@teste.com",
      password: "senha-errada",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("valida o corpo da requisição", async () => {
    const response = await request(app).post("/athos_adm/api/auth/login").send({ email: "invalido" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejeita usuário inativo", async () => {
    const response = await request(app).post("/athos_adm/api/auth/login").send({
      email: "inativo@teste.com",
      password: "senha123",
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("USER_INACTIVE");
  });
});

describe("POST /athos_adm/api/auth/refresh", () => {
  it("renova os tokens a partir de um refresh token válido", async () => {
    const loginResponse = await request(app).post("/athos_adm/api/auth/login").send({
      email: "membro@teste.com",
      password: "senha123",
    });

    const refreshResponse = await request(app).post("/athos_adm/api/auth/refresh").send({
      refreshToken: loginResponse.body.data.refreshToken,
    });

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.data.accessToken).toEqual(expect.any(String));
    expect(refreshResponse.body.data.refreshToken).toEqual(expect.any(String));
  });

  it("rejeita um refresh token inválido", async () => {
    const response = await request(app)
      .post("/athos_adm/api/auth/refresh")
      .send({ refreshToken: "token-invalido" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });
});

describe("POST /athos_adm/api/auth/oauth/:provider", () => {
  it("retorna 501 pois o login social ainda não foi implementado", async () => {
    const response = await request(app).post("/athos_adm/api/auth/oauth/google").send({});

    expect(response.status).toBe(501);
    expect(response.body.error.code).toBe("NOT_IMPLEMENTED");
  });
});
