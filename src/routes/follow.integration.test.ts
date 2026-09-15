import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let userAId: string;
let userBId: string;
let otherChurchUserId: string;
let userAAccessToken: string;
let userBAccessToken: string;
let otherChurchUserAccessToken: string;

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

  const userA = await User.create({
    churchId: church._id,
    name: "Usuário A",
    email: "a@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  userAId = String(userA._id);

  const userB = await User.create({
    churchId: church._id,
    name: "Usuário B",
    email: "b@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  userBId = String(userB._id);

  const otherChurchUser = await User.create({
    churchId: otherChurch._id,
    name: "Usuário Outra Igreja",
    email: "outro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  otherChurchUserId = String(otherChurchUser._id);

  userAAccessToken = signAccessToken({ sub: userAId, churchId, roles: ["member"] });
  userBAccessToken = signAccessToken({ sub: userBId, churchId, roles: ["member"] });
  otherChurchUserAccessToken = signAccessToken({
    sub: otherChurchUserId,
    churchId: String(otherChurch._id),
    roles: ["member"],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/follows", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).post("/athos_adm/api/follows").send({ followingId: userBId });

    expect(response.status).toBe(401);
  });

  it("rejeita seguir a si mesmo", async () => {
    const response = await request(app)
      .post("/athos_adm/api/follows")
      .set("Authorization", `Bearer ${userAAccessToken}`)
      .send({ followingId: userAId });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CANNOT_FOLLOW_SELF");
  });

  it("retorna 404 para usuário de outra igreja", async () => {
    const response = await request(app)
      .post("/athos_adm/api/follows")
      .set("Authorization", `Bearer ${userAAccessToken}`)
      .send({ followingId: otherChurchUserId });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
  });

  it("cria o follow e incrementa os contadores", async () => {
    const response = await request(app)
      .post("/athos_adm/api/follows")
      .set("Authorization", `Bearer ${userAAccessToken}`)
      .send({ followingId: userBId });

    expect(response.status).toBe(201);
    expect(response.body.data.followerId).toBe(userAId);
    expect(response.body.data.followingId).toBe(userBId);

    const { User } = await import("../models/User.model");
    const userA = await User.findById(userAId);
    const userB = await User.findById(userBId);

    expect(userA?.followingCount).toBe(1);
    expect(userB?.followersCount).toBe(1);
  });

  it("rejeita seguir novamente quem já é seguido", async () => {
    const response = await request(app)
      .post("/athos_adm/api/follows")
      .set("Authorization", `Bearer ${userAAccessToken}`)
      .send({ followingId: userBId });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ALREADY_FOLLOWING");
  });

  it("não exige reciprocidade: B não segue A automaticamente", async () => {
    const response = await request(app)
      .get("/athos_adm/api/follows?type=following")
      .set("Authorization", `Bearer ${userBAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });
});

describe("GET /athos_adm/api/follows", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/follows");

    expect(response.status).toBe(401);
  });

  it("lista quem o usuário segue", async () => {
    const response = await request(app)
      .get("/athos_adm/api/follows?type=following")
      .set("Authorization", `Bearer ${userAAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].followingId).toBe(userBId);
  });

  it("lista os seguidores do usuário", async () => {
    const response = await request(app)
      .get("/athos_adm/api/follows?type=followers")
      .set("Authorization", `Bearer ${userBAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].followerId).toBe(userAId);
  });
});

describe("DELETE /athos_adm/api/follows/:followingId", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).delete(`/athos_adm/api/follows/${userBId}`);

    expect(response.status).toBe(401);
  });

  it("retorna 404 ao deixar de seguir quem não é seguido", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/follows/${userAId}`)
      .set("Authorization", `Bearer ${userBAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("FOLLOW_NOT_FOUND");
  });

  it("deixa de seguir e decrementa os contadores", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/follows/${userBId}`)
      .set("Authorization", `Bearer ${userAAccessToken}`);

    expect(response.status).toBe(204);

    const { User } = await import("../models/User.model");
    const userA = await User.findById(userAId);
    const userB = await User.findById(userBId);

    expect(userA?.followingCount).toBe(0);
    expect(userB?.followersCount).toBe(0);
  });
});
