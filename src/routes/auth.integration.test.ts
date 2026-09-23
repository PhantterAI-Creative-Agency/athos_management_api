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

describe("POST /athos_adm/api/auth/register", () => {
  const base = {
    churchSlug: "igreja-teste",
    name: "Novo Usuário",
    email: "novo@teste.com",
    password: "senha1234",
    isChurchMember: true,
  };

  it("cadastra o usuário como inativo", async () => {
    const response = await request(app).post("/athos_adm/api/auth/register").send({
      ...base,
      address: { cep: "09015-000", street: "Rua A", city: "Santo André", state: "SP", number: "10" },
    });

    expect(response.status).toBe(201);

    const { User } = await import("../models/User.model");
    const user = await User.findOne({ email: "novo@teste.com" });
    expect(user?.active).toBe(false);
    expect(user?.pendingApproval).toBe(true);
    expect(user?.isChurchMember).toBe(true);
    expect(user?.address?.cep).toBe("09015000");
  });

  it("rejeita e-mail já cadastrado", async () => {
    const response = await request(app)
      .post("/athos_adm/api/auth/register")
      .send({ ...base, email: "membro@teste.com" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("exige o número quando o CEP é informado", async () => {
    const response = await request(app)
      .post("/athos_adm/api/auth/register")
      .send({ ...base, email: "cep@teste.com", address: { cep: "09015000", street: "Rua A" } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("exige o campo membro e rejeita username duplicado", async () => {
    const { isChurchMember: _omit, ...withoutMember } = base;
    const missing = await request(app)
      .post("/athos_adm/api/auth/register")
      .send({ ...withoutMember, email: "a@teste.com" });
    expect(missing.status).toBe(400);

    await request(app).post("/athos_adm/api/auth/register").send({ ...base, email: "u1@teste.com", username: "fulano" });
    const dup = await request(app)
      .post("/athos_adm/api/auth/register")
      .send({ ...base, email: "u2@teste.com", username: "Fulano" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("USERNAME_ALREADY_EXISTS");
  });
});
