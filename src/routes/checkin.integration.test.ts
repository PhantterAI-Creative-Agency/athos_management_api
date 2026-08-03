import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let memberId: string;
let memberAccessToken: string;
let adminAccessToken: string;
let otherChurchMemberAccessToken: string;
let eventId: string;
let otherChurchEventId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { Event } = await import("../models/Event.model");
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
  memberId = String(member._id);

  const admin = await User.create({
    churchId: church._id,
    name: "Admin Teste",
    email: "admin@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  const otherChurchMember = await User.create({
    churchId: otherChurch._id,
    name: "Membro Outra Igreja",
    email: "membro2@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  memberAccessToken = signAccessToken({ sub: memberId, churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  otherChurchMemberAccessToken = signAccessToken({
    sub: String(otherChurchMember._id),
    churchId: String(otherChurch._id),
    roles: ["member"],
  });

  const event = await Event.create({
    churchId: church._id,
    title: "Culto de Celebração",
    imageUrl: "https://example.com/event.png",
    date: new Date("2026-08-01T19:00:00.000Z"),
  });
  eventId = String(event._id);

  const otherChurchEvent = await Event.create({
    churchId: otherChurch._id,
    title: "Culto de outra igreja",
    imageUrl: "https://example.com/event2.png",
    date: new Date("2026-08-01T19:00:00.000Z"),
  });
  otherChurchEventId = String(otherChurchEvent._id);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /athos_adm/api/checkin/token", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/checkin/token");

    expect(response.status).toBe(401);
  });

  it("gera um token de check-in para o próprio usuário", async () => {
    const response = await request(app)
      .get("/athos_adm/api/checkin/token")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(typeof response.body.data.token).toBe("string");
    expect(typeof response.body.data.expiresAt).toBe("string");
  });

  it("gera um token de check-in vinculado a um evento da própria igreja", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/checkin/token?eventId=${eventId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(typeof response.body.data.token).toBe("string");
  });

  it("retorna 404 para evento de outra igreja", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/checkin/token?eventId=${otherChurchEventId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("EVENT_NOT_FOUND");
  });
});

describe("POST /athos_adm/api/checkin", () => {
  it("rejeita requisição sem token de acesso", async () => {
    const response = await request(app).post("/athos_adm/api/checkin").send({ token: "qualquer" });

    expect(response.status).toBe(401);
  });

  it("valida o corpo da requisição", async () => {
    const response = await request(app)
      .post("/athos_adm/api/checkin")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejeita um token de check-in malformado", async () => {
    const response = await request(app)
      .post("/athos_adm/api/checkin")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ token: "token-invalido" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CHECKIN_TOKEN_INVALID");
  });

  it("registra o check-in de um membro a partir do QR gerado por ele", async () => {
    const tokenResponse = await request(app)
      .get(`/athos_adm/api/checkin/token?eventId=${eventId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    const response = await request(app)
      .post("/athos_adm/api/checkin")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ token: tokenResponse.body.data.token });

    expect(response.status).toBe(201);
    expect(response.body.data.userId).toBe(memberId);
    expect(response.body.data.eventId).toBe(eventId);
    expect(response.body.data.checkedInBy).toBe(String(JSON.parse(Buffer.from(adminAccessToken.split(".")[1], "base64").toString()).sub));
  });

  it("rejeita reuso do mesmo QR Code", async () => {
    const tokenResponse = await request(app)
      .get(`/athos_adm/api/checkin/token?eventId=${eventId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    const firstAttempt = await request(app)
      .post("/athos_adm/api/checkin")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ token: tokenResponse.body.data.token });

    expect(firstAttempt.status).toBe(201);

    const secondAttempt = await request(app)
      .post("/athos_adm/api/checkin")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ token: tokenResponse.body.data.token });

    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error.code).toBe("CHECKIN_ALREADY_USED");
  });

  it("rejeita QR Code de um usuário de outra igreja", async () => {
    const tokenResponse = await request(app)
      .get("/athos_adm/api/checkin/token")
      .set("Authorization", `Bearer ${otherChurchMemberAccessToken}`);

    const response = await request(app)
      .post("/athos_adm/api/checkin")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ token: tokenResponse.body.data.token });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CHECKIN_TOKEN_INVALID");
  });
});

describe("GET /athos_adm/api/checkin", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/checkin");

    expect(response.status).toBe(401);
  });

  it("membro comum só vê os próprios check-ins", async () => {
    const response = await request(app)
      .get("/athos_adm/api/checkin")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((log: { userId: string }) => log.userId === memberId),
    ).toBe(true);
  });

  it("admin pode filtrar por userId", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/checkin?userId=${memberId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(
      response.body.data.every((log: { userId: string }) => log.userId === memberId),
    ).toBe(true);
  });
});
