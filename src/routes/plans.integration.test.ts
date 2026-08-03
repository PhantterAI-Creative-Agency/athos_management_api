import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let memberAccessToken: string;
let devAdminAccessToken: string;
let planId: string;
let memberUserId: string;
let friendUserId: string;
let friendAccessToken: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { BiblePlan } = await import("../models/BiblePlan.model");
  const { Friendship } = await import("../models/Friendship.model");
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
    email: "membro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  memberUserId = String(member._id);

  const friend = await User.create({
    churchId: church._id,
    name: "Amigo Teste",
    email: "amigo@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  friendUserId = String(friend._id);

  const devAdmin = await User.create({
    churchId: church._id,
    name: "DevAdmin Teste",
    email: "devadmin@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["devAdmin"],
  });

  memberAccessToken = signAccessToken({ sub: memberUserId, churchId, roles: ["member"] });
  friendAccessToken = signAccessToken({ sub: friendUserId, churchId, roles: ["member"] });
  devAdminAccessToken = signAccessToken({ sub: String(devAdmin._id), churchId, roles: ["devAdmin"] });

  await Friendship.create({ userId: member._id, friendId: friend._id, status: "accepted" });

  const plan = await BiblePlan.create({
    title: "21 dias de oração",
    coverUrl: "https://example.com/cover.png",
    durationDays: 21,
    themes: ["oração"],
    source: "internal",
  });
  planId = String(plan._id);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/plans", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).post("/athos_adm/api/plans").send({ title: "Novo" });

    expect(response.status).toBe(401);
  });

  it("rejeita usuário sem role devAdmin", async () => {
    const response = await request(app)
      .post("/athos_adm/api/plans")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ title: "Novo", coverUrl: "https://example.com/c.png", durationDays: 7 });

    expect(response.status).toBe(403);
  });

  it("devAdmin cria um plano no catálogo global", async () => {
    const response = await request(app)
      .post("/athos_adm/api/plans")
      .set("Authorization", `Bearer ${devAdminAccessToken}`)
      .send({ title: "7 dias de gratidão", coverUrl: "https://example.com/c2.png", durationDays: 7 });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe("7 dias de gratidão");
    expect(response.body.data.source).toBe("internal");
  });

  it("valida o corpo da requisição", async () => {
    const response = await request(app)
      .post("/athos_adm/api/plans")
      .set("Authorization", `Bearer ${devAdminAccessToken}`)
      .send({ title: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /athos_adm/api/plans", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/plans");

    expect(response.status).toBe(401);
  });

  it("tab find retorna o catálogo completo", async () => {
    const response = await request(app)
      .get("/athos_adm/api/plans?tab=find")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.some((plan: { id: string }) => plan.id === planId)).toBe(true);
  });

  it("tab saved retorna vazio quando o usuário não salvou nenhum plano", async () => {
    const response = await request(app)
      .get("/athos_adm/api/plans?tab=saved")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

describe("GET /athos_adm/api/plans/:id", () => {
  it("retorna o plano com progress null quando o usuário nunca interagiu", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/plans/${planId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(planId);
    expect(response.body.data.progress).toBeNull();
  });

  it("retorna 404 para plano inexistente", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/plans/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PLAN_NOT_FOUND");
  });
});

describe("POST /athos_adm/api/plans/:id/progress", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).post(`/athos_adm/api/plans/${planId}/progress`).send({});

    expect(response.status).toBe(401);
  });

  it("cria progresso salvo quando o usuário salva o plano pela primeira vez", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/plans/${planId}/progress`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ status: "saved" });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("saved");
    expect(response.body.data.currentDay).toBe(0);
    expect(response.body.data.totalDays).toBe(21);
  });

  it("avança o progresso e mantém em in_progress", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/plans/${planId}/progress`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ status: "in_progress", currentDay: 10 });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("in_progress");
    expect(response.body.data.currentDay).toBe(10);
    expect(response.body.data.completedAt).toBeUndefined();
  });

  it("marca como completed automaticamente ao atingir totalDays", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/plans/${planId}/progress`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ currentDay: 21 });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("completed");
    expect(response.body.data.currentDay).toBe(21);
    expect(response.body.data.completedAt).toBeDefined();
  });

  it("reflete o plano concluído na tab completed", async () => {
    const response = await request(app)
      .get("/athos_adm/api/plans?tab=completed")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.some((plan: { id: string }) => plan.id === planId)).toBe(true);
  });

  it("mostra o amigo aceito na lista de friendsAlsoCompletedIds do amigo", async () => {
    await request(app)
      .post(`/athos_adm/api/plans/${planId}/progress`)
      .set("Authorization", `Bearer ${friendAccessToken}`)
      .send({ currentDay: 21 });

    const response = await request(app)
      .get(`/athos_adm/api/plans/${planId}`)
      .set("Authorization", `Bearer ${friendAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.progress.friendsAlsoCompletedIds).toContain(memberUserId);
  });
});

describe("PATCH /athos_adm/api/plans/:id", () => {
  it("rejeita usuário sem role devAdmin", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/plans/${planId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ title: "Atualizado" });

    expect(response.status).toBe(403);
  });

  it("devAdmin atualiza o plano do catálogo global", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/plans/${planId}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`)
      .send({ title: "21 dias de oração (revisado)" });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe("21 dias de oração (revisado)");
  });
});

describe("DELETE /athos_adm/api/plans/:id", () => {
  it("rejeita usuário sem role devAdmin", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/plans/${planId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("devAdmin remove o plano do catálogo global", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/plans/${planId}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`);

    expect(response.status).toBe(204);

    const getResponse = await request(app)
      .get(`/athos_adm/api/plans/${planId}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`);

    expect(getResponse.status).toBe(404);
  });
});
