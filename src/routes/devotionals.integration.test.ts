import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let memberAccessToken: string;
let adminAccessToken: string;
let otherChurchAdminAccessToken: string;
let devotionalId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { Devotional } = await import("../models/Devotional.model");
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

  const member = await User.create({
    churchId: church._id,
    name: "Membro Teste",
    email: "membro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  const admin = await User.create({
    churchId: church._id,
    name: "Admin Teste",
    email: "admin@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  const otherChurchAdmin = await User.create({
    churchId: otherChurch._id,
    name: "Admin Outra Igreja",
    email: "admin2@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  memberAccessToken = signAccessToken({ sub: String(member._id), churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  otherChurchAdminAccessToken = signAccessToken({
    sub: String(otherChurchAdmin._id),
    churchId: String(otherChurch._id),
    roles: ["admin"],
  });

  const devotional = await Devotional.create({
    churchId: church._id,
    title: "A fidelidade de Deus",
    content: "Texto devocional de teste.",
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  devotionalId = String(devotional._id);

  await Devotional.create({
    churchId: otherChurch._id,
    title: "Devocional de outra igreja",
    content: "Não deve aparecer para a igreja teste.",
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/devotionals", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app)
      .post("/athos_adm/api/devotionals")
      .send({ title: "Novo", content: "Conteúdo" });

    expect(response.status).toBe(401);
  });

  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .post("/athos_adm/api/devotionals")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ title: "Novo", content: "Conteúdo" });

    expect(response.status).toBe(403);
  });

  it("admin cria um devocional na própria igreja", async () => {
    const response = await request(app)
      .post("/athos_adm/api/devotionals")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ title: "Novo devocional", content: "Conteúdo do devocional" });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe("Novo devocional");
    expect(response.body.data.churchId).toBe(churchId);
  });

  it("valida o corpo da requisição", async () => {
    const response = await request(app)
      .post("/athos_adm/api/devotionals")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ title: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /athos_adm/api/devotionals", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/devotionals");

    expect(response.status).toBe(401);
  });

  it("lista apenas os devocionais da própria igreja", async () => {
    const response = await request(app)
      .get("/athos_adm/api/devotionals")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((devotional: { churchId: string }) => devotional.churchId === churchId),
    ).toBe(true);
    expect(
      response.body.data.some(
        (devotional: { title: string }) => devotional.title === "Devocional de outra igreja",
      ),
    ).toBe(false);
  });
});

describe("GET /athos_adm/api/devotionals/:id", () => {
  it("retorna o devocional isolado por igreja", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/devotionals/${devotionalId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(devotionalId);
  });

  it("retorna 404 para admin de outra igreja", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/devotionals/${devotionalId}`)
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("DEVOTIONAL_NOT_FOUND");
  });
});

describe("PATCH /athos_adm/api/devotionals/:id", () => {
  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/devotionals/${devotionalId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ title: "Atualizado" });

    expect(response.status).toBe(403);
  });

  it("admin atualiza o devocional da própria igreja", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/devotionals/${devotionalId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ title: "A fidelidade de Deus (revisado)" });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe("A fidelidade de Deus (revisado)");
  });

  it("admin de outra igreja não encontra o devocional", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/devotionals/${devotionalId}`)
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`)
      .send({ title: "Invasão" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /athos_adm/api/devotionals/:id", () => {
  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/devotionals/${devotionalId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("admin remove o devocional da própria igreja", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/devotionals/${devotionalId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(204);

    const getResponse = await request(app)
      .get(`/athos_adm/api/devotionals/${devotionalId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(getResponse.status).toBe(404);
  });
});
