import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let leaderUserId: string;
let memberAccessToken: string;
let adminAccessToken: string;

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
    slug: "igreja-teste-pastoral",
    settings: { primaryColor: "#123456" },
  });
  churchId = String(church._id);

  const member = await User.create({
    churchId: church._id,
    name: "Membro Teste",
    email: "membro-pastoral@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  const admin = await User.create({
    churchId: church._id,
    name: "Admin Teste",
    email: "admin-pastoral@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  const leader = await User.create({
    churchId: church._id,
    name: "Líder de Acompanhamento",
    email: "lider-pastoral@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["elder"],
  });
  leaderUserId = String(leader._id);

  memberAccessToken = signAccessToken({ sub: String(member._id), churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/pastoral-care/recipients", () => {
  it("rejeita membro comum (apenas admin)", async () => {
    const response = await request(app)
      .post("/athos_adm/api/pastoral-care/recipients")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ userId: leaderUserId });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("permite admin cadastrar um destinatário", async () => {
    const response = await request(app)
      .post("/athos_adm/api/pastoral-care/recipients")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ userId: leaderUserId });

    expect(response.status).toBe(201);
    expect(response.body.data.userId).toBe(leaderUserId);
    expect(response.body.data.active).toBe(true);
  });
});

describe("GET /athos_adm/api/pastoral-care/recipients", () => {
  it("lista destinatários apenas para admin", async () => {
    const response = await request(app)
      .get("/athos_adm/api/pastoral-care/recipients")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("rejeita membro comum", async () => {
    const response = await request(app)
      .get("/athos_adm/api/pastoral-care/recipients")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(403);
  });
});

describe("PATCH /athos_adm/api/pastoral-care/recipients/:id", () => {
  it("permite admin desativar um destinatário", async () => {
    const list = await request(app)
      .get("/athos_adm/api/pastoral-care/recipients")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    const recipientId = list.body.data[0].id;

    const response = await request(app)
      .patch(`/athos_adm/api/pastoral-care/recipients/${recipientId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ active: false });

    expect(response.status).toBe(200);
    expect(response.body.data.active).toBe(false);
  });
});
