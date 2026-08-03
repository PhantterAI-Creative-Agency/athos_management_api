import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let memberId: string;
let otherMemberId: string;
let memberAccessToken: string;
let otherMemberAccessToken: string;
let adminAccessToken: string;
let otherChurchAdminAccessToken: string;
let ministryId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { Ministry } = await import("../models/Ministry.model");
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

  const otherMember = await User.create({
    churchId: church._id,
    name: "Outro Membro",
    email: "outromembro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  otherMemberId = String(otherMember._id);

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

  memberAccessToken = signAccessToken({ sub: memberId, churchId, roles: ["member"] });
  otherMemberAccessToken = signAccessToken({ sub: otherMemberId, churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  otherChurchAdminAccessToken = signAccessToken({
    sub: String(otherChurchAdmin._id),
    churchId: String(otherChurch._id),
    roles: ["admin"],
  });

  const louvor = await Ministry.create({
    churchId: church._id,
    name: "Louvor",
    contractRequired: false,
  });
  ministryId = String(louvor._id);

  await Ministry.create({
    churchId: church._id,
    name: "Infantil",
    contractRequired: true,
  });

  await Ministry.create({
    churchId: otherChurch._id,
    name: "Ministério de Outra Igreja",
    contractRequired: false,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/ministries", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).post("/athos_adm/api/ministries").send({ name: "Mídia" });

    expect(response.status).toBe(401);
  });

  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .post("/athos_adm/api/ministries")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ name: "Mídia" });

    expect(response.status).toBe(403);
  });

  it("admin cria um ministério na própria igreja", async () => {
    const response = await request(app)
      .post("/athos_adm/api/ministries")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ name: "Mídia", iconUrl: "https://example.com/icon.png" });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("Mídia");
    expect(response.body.data.churchId).toBe(churchId);
    expect(response.body.data.participantsCount).toBe(0);
    expect(response.body.data.isVolunteer).toBe(false);
  });

  it("valida o corpo da requisição", async () => {
    const response = await request(app)
      .post("/athos_adm/api/ministries")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /athos_adm/api/ministries", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/ministries");

    expect(response.status).toBe(401);
  });

  it("lista apenas os ministérios da própria igreja", async () => {
    const response = await request(app)
      .get("/athos_adm/api/ministries")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((ministry: { churchId: string }) => ministry.churchId === churchId),
    ).toBe(true);
    expect(
      response.body.data.some((ministry: { name: string }) => ministry.name === "Ministério de Outra Igreja"),
    ).toBe(false);
  });

  it("destaca os ministérios do usuário primeiro", async () => {
    await request(app)
      .post(`/athos_adm/api/ministries/${ministryId}/volunteers`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({});

    const response = await request(app)
      .get("/athos_adm/api/ministries")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    const names = response.body.data.map((ministry: { name: string }) => ministry.name);
    expect(names[0]).toBe("Louvor");
    expect(response.body.data[0].isVolunteer).toBe(true);
  });

  it("aceita highlightUserId para destacar outro usuário", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/ministries?highlightUserId=${memberId}`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`);

    expect(response.status).toBe(200);
    const louvorEntry = response.body.data.find((ministry: { name: string }) => ministry.name === "Louvor");
    expect(louvorEntry.isVolunteer).toBe(true);
  });
});

describe("GET /athos_adm/api/ministries/:id", () => {
  it("retorna o ministério isolado por igreja", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(ministryId);
  });

  it("retorna 404 para admin de outra igreja", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}`)
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("MINISTRY_NOT_FOUND");
  });
});

describe("PATCH /athos_adm/api/ministries/:id", () => {
  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/ministries/${ministryId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ name: "Louvor e Adoração" });

    expect(response.status).toBe(403);
  });

  it("admin atualiza o ministério da própria igreja", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/ministries/${ministryId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ name: "Louvor e Adoração" });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Louvor e Adoração");
  });

  it("admin de outra igreja não encontra o ministério", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/ministries/${ministryId}`)
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`)
      .send({ name: "Invasão" });

    expect(response.status).toBe(404);
  });
});

describe("POST /athos_adm/api/ministries/:id/volunteers", () => {
  it("permite que o próprio usuário se vincule como voluntário", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/ministries/${ministryId}/volunteers`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`)
      .send({ role: "cantor" });

    expect(response.status).toBe(201);
    expect(response.body.data.userId).toBe(otherMemberId);
    expect(response.body.data.role).toBe("cantor");
    expect(response.body.data.active).toBe(true);
  });

  it("não duplica o contador ao reenviar o mesmo voluntário ativo", async () => {
    const before = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    const response = await request(app)
      .post(`/athos_adm/api/ministries/${ministryId}/volunteers`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`)
      .send({ role: "cantor-principal" });

    expect(response.status).toBe(201);
    expect(response.body.data.role).toBe("cantor-principal");

    const after = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(after.body.data.participantsCount).toBe(before.body.data.participantsCount);
  });

  it("rejeita membro comum tentando vincular outro usuário", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/ministries/${ministryId}/volunteers`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ userId: otherMemberId });

    expect(response.status).toBe(403);
  });

  it("admin pode vincular outro usuário da mesma igreja", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/ministries/${ministryId}/volunteers`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ userId: memberId, role: "instrumentista" });

    expect(response.status).toBe(201);
    expect(response.body.data.userId).toBe(memberId);
  });

  it("retorna 404 ao tentar vincular usuário de outra igreja", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/ministries/${ministryId}/volunteers`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ userId: String(new mongoose.Types.ObjectId()) });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
  });
});

describe("DELETE /athos_adm/api/ministries/:id", () => {
  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/ministries/${ministryId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("admin remove o ministério e seus vínculos de voluntário", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/ministries/${ministryId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(204);

    const getResponse = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(getResponse.status).toBe(404);
  });
});
