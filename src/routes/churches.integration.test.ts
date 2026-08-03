import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let adminAccessToken: string;
let memberAccessToken: string;
let otherChurchAdminAccessToken: string;
let churchId: string;

beforeAll(async () => {
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
  churchId = String(church._id);

  const otherChurch = await Church.create({
    name: "Outra Igreja",
    logoUrl: "https://example.com/logo2.png",
    slug: "outra-igreja",
    settings: { primaryColor: "#654321" },
  });

  const admin = await User.create({
    churchId: church._id,
    name: "Admin Teste",
    email: "admin@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  const member = await User.create({
    churchId: church._id,
    name: "Membro Teste",
    email: "membro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  const otherChurchAdmin = await User.create({
    churchId: otherChurch._id,
    name: "Admin Outra Igreja",
    email: "admin2@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId: churchId, roles: ["admin"] });
  memberAccessToken = signAccessToken({ sub: String(member._id), churchId: churchId, roles: ["member"] });
  otherChurchAdminAccessToken = signAccessToken({
    sub: String(otherChurchAdmin._id),
    churchId: String(otherChurch._id),
    roles: ["admin"],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /athos_adm/api/churches/search", () => {
  it("não exige autenticação", async () => {
    const response = await request(app).get("/athos_adm/api/churches/search").query({ q: "Teste" });

    expect(response.status).toBe(200);
  });

  it("valida a ausência do parâmetro q", async () => {
    const response = await request(app).get("/athos_adm/api/churches/search");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("busca igrejas por nome e retorna apenas os campos públicos", async () => {
    const response = await request(app).get("/athos_adm/api/churches/search").query({ q: "Igreja Teste" });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toEqual({
      name: "Igreja Teste",
      logoUrl: "https://example.com/logo.png",
      slug: "igreja-teste",
    });
  });

  it("busca igrejas por slug, case-insensitive", async () => {
    const response = await request(app).get("/athos_adm/api/churches/search").query({ q: "OUTRA-igreja" });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].slug).toBe("outra-igreja");
  });

  it("retorna lista vazia quando não há correspondência", async () => {
    const response = await request(app).get("/athos_adm/api/churches/search").query({ q: "Nenhuma Igreja" });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

describe("GET /athos_adm/api/churches/me", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/churches/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("permite qualquer usuário autenticado ler os dados da própria igreja", async () => {
    const response = await request(app)
      .get("/athos_adm/api/churches/me")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(churchId);
  });

  it("retorna os dados da igreja do admin autenticado", async () => {
    const response = await request(app)
      .get("/athos_adm/api/churches/me")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(churchId);
    expect(response.body.data.name).toBe("Igreja Teste");
    expect(response.body.data.settings.growthGroupName).toBe("Grupos de Crescimento");
    expect(response.body.data.settings.growthGroupAcronym).toBe("GC");
  });

  it("isola a igreja por admin de outra igreja", async () => {
    const response = await request(app)
      .get("/athos_adm/api/churches/me")
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).not.toBe(churchId);
    expect(response.body.data.name).toBe("Outra Igreja");
  });
});

describe("PATCH /athos_adm/api/churches/me", () => {
  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .patch("/athos_adm/api/churches/me")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ name: "Novo Nome" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("valida o corpo da requisição", async () => {
    const response = await request(app)
      .patch("/athos_adm/api/churches/me")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("atualiza os dados da igreja do admin autenticado", async () => {
    const response = await request(app)
      .patch("/athos_adm/api/churches/me")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ name: "Igreja Atualizada", settings: { primaryColor: "#ffffff" } });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Igreja Atualizada");
    expect(response.body.data.settings.primaryColor).toBe("#ffffff");
  });

  it("altera growthGroupName/growthGroupAcronym sem apagar os demais campos de settings", async () => {
    const response = await request(app)
      .patch("/athos_adm/api/churches/me")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ settings: { growthGroupName: "Reunião nos Lares", growthGroupAcronym: "RL" } });

    expect(response.status).toBe(200);
    expect(response.body.data.settings.growthGroupName).toBe("Reunião nos Lares");
    expect(response.body.data.settings.growthGroupAcronym).toBe("RL");
    expect(response.body.data.settings.primaryColor).toBe("#ffffff");
  });
});
