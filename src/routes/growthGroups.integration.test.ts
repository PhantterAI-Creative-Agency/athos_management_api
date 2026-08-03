import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let leaderId: string;
let memberId: string;
let otherMemberId: string;
let leaderAccessToken: string;
let memberAccessToken: string;
let otherMemberAccessToken: string;
let adminAccessToken: string;
let otherChurchAdminAccessToken: string;
let growthGroupId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { GrowthGroup } = await import("../models/GrowthGroup.model");
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

  const leader = await User.create({
    churchId: church._id,
    name: "Líder Teste",
    email: "lider@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["groupLeader"],
  });
  leaderId = String(leader._id);

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

  leaderAccessToken = signAccessToken({ sub: leaderId, churchId, roles: ["groupLeader"] });
  memberAccessToken = signAccessToken({ sub: memberId, churchId, roles: ["member"] });
  otherMemberAccessToken = signAccessToken({ sub: otherMemberId, churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  otherChurchAdminAccessToken = signAccessToken({
    sub: String(otherChurchAdmin._id),
    churchId: String(otherChurch._id),
    roles: ["admin"],
  });

  const jovens = await GrowthGroup.create({
    churchId: church._id,
    name: "GC Jovens",
    leaderId: leader._id,
    membersIds: [],
  });
  growthGroupId = String(jovens._id);

  await GrowthGroup.create({
    churchId: church._id,
    name: "GC Casais",
    leaderId: leader._id,
    membersIds: [],
  });

  await GrowthGroup.create({
    churchId: otherChurch._id,
    name: "GC de Outra Igreja",
    leaderId: otherChurchAdmin._id,
    membersIds: [],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/growth-groups", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app)
      .post("/athos_adm/api/growth-groups")
      .send({ name: "GC Novo", leaderId });

    expect(response.status).toBe(401);
  });

  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .post("/athos_adm/api/growth-groups")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ name: "GC Novo", leaderId });

    expect(response.status).toBe(403);
  });

  it("admin cria um GC na própria igreja", async () => {
    const response = await request(app)
      .post("/athos_adm/api/growth-groups")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ name: "GC Novo", leaderId });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("GC Novo");
    expect(response.body.data.churchId).toBe(churchId);
    expect(response.body.data.leaderId).toBe(leaderId);
    expect(response.body.data.membersIds).toEqual([]);
    expect(response.body.data.hasPendencies).toBe(false);
    expect(response.body.data.indicators.attendanceRate).toBe(0);
  });

  it("valida o corpo da requisição", async () => {
    const response = await request(app)
      .post("/athos_adm/api/growth-groups")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("retorna 404 ao informar líder inexistente", async () => {
    const response = await request(app)
      .post("/athos_adm/api/growth-groups")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ name: "GC Sem Líder", leaderId: String(new mongoose.Types.ObjectId()) });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("LEADER_NOT_FOUND");
  });
});

describe("GET /athos_adm/api/growth-groups", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/growth-groups");

    expect(response.status).toBe(401);
  });

  it("lista apenas os GCs da própria igreja para qualquer autenticado", async () => {
    const response = await request(app)
      .get("/athos_adm/api/growth-groups")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((growthGroup: { churchId: string }) => growthGroup.churchId === churchId),
    ).toBe(true);
    expect(
      response.body.data.some(
        (growthGroup: { name: string }) => growthGroup.name === "GC de Outra Igreja",
      ),
    ).toBe(false);
  });

  it("filtra somente os GCs do usuário quando mine=true", async () => {
    await request(app)
      .post(`/athos_adm/api/growth-groups/${growthGroupId}/members/${memberId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    const response = await request(app)
      .get("/athos_adm/api/growth-groups?mine=true")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(growthGroupId);
  });

  it("mine=true retorna os GCs em que o usuário é líder", async () => {
    const response = await request(app)
      .get("/athos_adm/api/growth-groups?mine=true")
      .set("Authorization", `Bearer ${leaderAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);
  });
});

describe("GET /athos_adm/api/growth-groups/:id", () => {
  it("retorna o GC isolado por igreja", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/growth-groups/${growthGroupId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(growthGroupId);
  });

  it("retorna 404 para admin de outra igreja", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/growth-groups/${growthGroupId}`)
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("GROWTH_GROUP_NOT_FOUND");
  });
});

describe("PATCH /athos_adm/api/growth-groups/:id", () => {
  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/growth-groups/${growthGroupId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ name: "GC Jovens Adultos" });

    expect(response.status).toBe(403);
  });

  it("admin atualiza o GC da própria igreja", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/growth-groups/${growthGroupId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ name: "GC Jovens Adultos", hasPendencies: true });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("GC Jovens Adultos");
    expect(response.body.data.hasPendencies).toBe(true);
  });

  it("admin de outra igreja não encontra o GC", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/growth-groups/${growthGroupId}`)
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`)
      .send({ name: "Invasão" });

    expect(response.status).toBe(404);
  });
});

describe("POST /athos_adm/api/growth-groups/:id/members/:userId", () => {
  it("rejeita membro comum tentando adicionar outro membro", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/growth-groups/${growthGroupId}/members/${otherMemberId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("o líder do GC pode adicionar um membro", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/growth-groups/${growthGroupId}/members/${otherMemberId}`)
      .set("Authorization", `Bearer ${leaderAccessToken}`);

    expect(response.status).toBe(201);
    expect(response.body.data.membersIds).toContain(otherMemberId);
  });

  it("não duplica o membro ao reenviar o mesmo usuário", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/growth-groups/${growthGroupId}/members/${otherMemberId}`)
      .set("Authorization", `Bearer ${leaderAccessToken}`);

    expect(response.status).toBe(201);
    const occurrences = response.body.data.membersIds.filter((id: string) => id === otherMemberId);
    expect(occurrences).toHaveLength(1);
  });

  it("retorna 404 ao tentar adicionar usuário de outra igreja", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/growth-groups/${growthGroupId}/members/${String(new mongoose.Types.ObjectId())}`)
      .set("Authorization", `Bearer ${leaderAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
  });
});

describe("DELETE /athos_adm/api/growth-groups/:id/members/:userId", () => {
  it("rejeita membro comum tentando remover outro membro", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/growth-groups/${growthGroupId}/members/${otherMemberId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("admin remove um membro do GC", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/growth-groups/${growthGroupId}/members/${otherMemberId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.membersIds).not.toContain(otherMemberId);
  });
});

describe("DELETE /athos_adm/api/growth-groups/:id", () => {
  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/growth-groups/${growthGroupId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("admin remove o GC", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/growth-groups/${growthGroupId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(204);

    const getResponse = await request(app)
      .get(`/athos_adm/api/growth-groups/${growthGroupId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(getResponse.status).toBe(404);
  });
});
