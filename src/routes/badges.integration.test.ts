import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let memberAccessToken: string;
let memberUserId: string;
let devAdminAccessToken: string;
let streakBadgeId: string;

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

  const member = await User.create({
    churchId: church._id,
    name: "Membro Teste",
    email: "membro-badges@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
    streak: 5,
  });
  memberUserId = String(member._id);

  const devAdmin = await User.create({
    churchId: church._id,
    name: "DevAdmin Teste",
    email: "devadmin-badges@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["devAdmin"],
  });

  memberAccessToken = signAccessToken({ sub: memberUserId, churchId, roles: ["member"] });
  devAdminAccessToken = signAccessToken({ sub: String(devAdmin._id), churchId, roles: ["devAdmin"] });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/badges", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).post("/athos_adm/api/badges").send({});

    expect(response.status).toBe(401);
  });

  it("rejeita usuário sem role devAdmin", async () => {
    const response = await request(app)
      .post("/athos_adm/api/badges")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({
        key: "streak_7",
        name: "7 dias seguidos",
        iconUrl: "https://example.com/streak.png",
        criteria: { type: "streak", target: 7 },
      });

    expect(response.status).toBe(403);
  });

  it("devAdmin cria uma badge no catálogo global", async () => {
    const response = await request(app)
      .post("/athos_adm/api/badges")
      .set("Authorization", `Bearer ${devAdminAccessToken}`)
      .send({
        key: "streak_7",
        name: "7 dias seguidos",
        iconUrl: "https://example.com/streak.png",
        criteria: { type: "streak", target: 7 },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.key).toBe("streak_7");
    streakBadgeId = response.body.data.id;
  });

  it("valida o corpo da requisição", async () => {
    const response = await request(app)
      .post("/athos_adm/api/badges")
      .set("Authorization", `Bearer ${devAdminAccessToken}`)
      .send({ key: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /athos_adm/api/badges", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/badges");

    expect(response.status).toBe(401);
  });

  it("retorna o catálogo completo para qualquer autenticado", async () => {
    const response = await request(app)
      .get("/athos_adm/api/badges")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.some((badge: { id: string }) => badge.id === streakBadgeId)).toBe(true);
  });
});

describe("GET /athos_adm/api/badges/me", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/badges/me");

    expect(response.status).toBe(401);
  });

  it("calcula o progresso com base no streak do usuário e concede a badge atingida", async () => {
    const response = await request(app)
      .get("/athos_adm/api/badges/me")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    const streakBadge = response.body.data.find((badge: { id: string }) => badge.id === streakBadgeId);
    expect(streakBadge.progress).toBe(5);
    expect(streakBadge.earned).toBe(false);
  });

  it("marca como earned quando o progresso atinge a meta", async () => {
    const { User } = await import("../models/User.model");
    await User.updateOne({ _id: memberUserId }, { streak: 10 });

    const response = await request(app)
      .get("/athos_adm/api/badges/me")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    const streakBadge = response.body.data.find((badge: { id: string }) => badge.id === streakBadgeId);
    expect(streakBadge.progress).toBe(10);
    expect(streakBadge.earned).toBe(true);

    const user = await User.findById(memberUserId).select("badges");
    expect(user?.badges.map(String)).toContain(streakBadgeId);
  });
});

describe("PATCH /athos_adm/api/badges/:id", () => {
  it("rejeita usuário sem role devAdmin", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/badges/${streakBadgeId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ name: "Atualizado" });

    expect(response.status).toBe(403);
  });

  it("devAdmin atualiza a badge do catálogo global", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/badges/${streakBadgeId}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`)
      .send({ name: "7 dias seguidos (revisado)" });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("7 dias seguidos (revisado)");
  });

  it("retorna 404 para badge inexistente", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/badges/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`)
      .send({ name: "Não existe" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("BADGE_NOT_FOUND");
  });
});

describe("DELETE /athos_adm/api/badges/:id", () => {
  it("rejeita usuário sem role devAdmin", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/badges/${streakBadgeId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("devAdmin remove a badge do catálogo global e limpa User.badges", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/badges/${streakBadgeId}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`);

    expect(response.status).toBe(204);

    const { User } = await import("../models/User.model");
    const user = await User.findById(memberUserId).select("badges");
    expect(user?.badges.map(String)).not.toContain(streakBadgeId);
  });
});
