import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let userId: string;
let userAccessToken: string;
let otherUserAccessToken: string;

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

  const user = await User.create({
    churchId: church._id,
    name: "Usuário Teste",
    email: "usuario@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  userId = String(user._id);

  const otherUser = await User.create({
    churchId: church._id,
    name: "Outro Usuário",
    email: "outro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  userAccessToken = signAccessToken({ sub: userId, churchId, roles: ["member"] });
  otherUserAccessToken = signAccessToken({ sub: String(otherUser._id), churchId, roles: ["member"] });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("PATCH /athos_adm/api/users/me/device-token", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app)
      .patch("/athos_adm/api/users/me/device-token")
      .send({ platform: "ios", token: "abc" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("valida platform e token", async () => {
    const response = await request(app)
      .patch("/athos_adm/api/users/me/device-token")
      .set("Authorization", `Bearer ${userAccessToken}`)
      .send({ platform: "invalid", token: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("registra o device token do usuário autenticado", async () => {
    const response = await request(app)
      .patch("/athos_adm/api/users/me/device-token")
      .set("Authorization", `Bearer ${userAccessToken}`)
      .send({ platform: "ios", token: "token-1" });

    expect(response.status).toBe(200);
    expect(response.body.data.userId).toBe(userId);
    expect(response.body.data.platform).toBe("ios");
    expect(response.body.data.token).toBe("token-1");
  });

  it("faz upsert do token ao registrar novamente para a mesma plataforma", async () => {
    const response = await request(app)
      .patch("/athos_adm/api/users/me/device-token")
      .set("Authorization", `Bearer ${userAccessToken}`)
      .send({ platform: "ios", token: "token-2" });

    expect(response.status).toBe(200);
    expect(response.body.data.token).toBe("token-2");

    const { DeviceToken } = await import("../models/DeviceToken.model");
    const count = await DeviceToken.countDocuments({ userId, platform: "ios" });
    expect(count).toBe(1);
  });
});

describe("GET /athos_adm/api/notifications", () => {
  let unreadId: string;

  beforeAll(async () => {
    const { Notification } = await import("../models/Notification.model");

    const unread = await Notification.create({
      userId,
      type: "verse_of_day",
      title: "Versículo do Dia",
      body: "Filipenses 4:13",
      read: false,
    });
    unreadId = String(unread._id);

    await Notification.create({
      userId,
      type: "mural",
      title: "Novo post no Mural",
      body: "Confira a novidade",
      read: true,
    });

    await Notification.create({
      userId: String(new mongoose.Types.ObjectId()),
      type: "event",
      title: "Notificação de outro usuário",
      body: "Não deve aparecer",
      read: false,
    });
  });

  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/notifications");

    expect(response.status).toBe(401);
  });

  it("lista apenas as notificações do próprio usuário", async () => {
    const response = await request(app)
      .get("/athos_adm/api/notifications")
      .set("Authorization", `Bearer ${userAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("filtra por read=false", async () => {
    const response = await request(app)
      .get("/athos_adm/api/notifications")
      .query({ read: "false" })
      .set("Authorization", `Bearer ${userAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(unreadId);
  });

  describe("PATCH /athos_adm/api/notifications/:id/read", () => {
    it("rejeita requisição sem token", async () => {
      const response = await request(app).patch(`/athos_adm/api/notifications/${unreadId}/read`);

      expect(response.status).toBe(401);
    });

    it("404 ao tentar marcar notificação de outro usuário", async () => {
      const response = await request(app)
        .patch(`/athos_adm/api/notifications/${unreadId}/read`)
        .set("Authorization", `Bearer ${otherUserAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOTIFICATION_NOT_FOUND");
    });

    it("404 para notificação inexistente", async () => {
      const response = await request(app)
        .patch(`/athos_adm/api/notifications/${new mongoose.Types.ObjectId()}/read`)
        .set("Authorization", `Bearer ${userAccessToken}`);

      expect(response.status).toBe(404);
    });

    it("marca a notificação como lida", async () => {
      const response = await request(app)
        .patch(`/athos_adm/api/notifications/${unreadId}/read`)
        .set("Authorization", `Bearer ${userAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.read).toBe(true);
    });
  });

  describe("PATCH /athos_adm/api/notifications/read-all", () => {
    it("rejeita requisição sem token", async () => {
      const response = await request(app).patch("/athos_adm/api/notifications/read-all");

      expect(response.status).toBe(401);
    });

    it("marca todas as notificações do usuário como lidas", async () => {
      const { Notification } = await import("../models/Notification.model");
      await Notification.create({
        userId,
        type: "plan_reminder",
        title: "Continue seu plano",
        body: "Não perca o streak",
        read: false,
      });

      const response = await request(app)
        .patch("/athos_adm/api/notifications/read-all")
        .set("Authorization", `Bearer ${userAccessToken}`);

      expect(response.status).toBe(204);

      const remainingUnread = await request(app)
        .get("/athos_adm/api/notifications")
        .query({ read: "false" })
        .set("Authorization", `Bearer ${userAccessToken}`);

      expect(remainingUnread.body.data).toHaveLength(0);
    });
  });
});
