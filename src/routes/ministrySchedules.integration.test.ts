import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let leaderId: string;
let leaderAccessToken: string;
let otherLeaderAccessToken: string;
let volunteerId: string;
let volunteerAccessToken: string;
let memberAccessToken: string;
let adminAccessToken: string;
let ministryId: string;
let otherMinistryId: string;
let instrumentoFunctionId: string;
let vocalFunctionId: string;

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
    slug: "igreja-teste-escalas",
    settings: { primaryColor: "#123456" },
  });
  churchId = String(church._id);

  const leader = await User.create({
    churchId: church._id,
    name: "Líder de Louvor",
    email: "lider@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["ministryLeader"],
  });
  leaderId = String(leader._id);

  const otherLeader = await User.create({
    churchId: church._id,
    name: "Líder de Outro Ministério",
    email: "outrolider@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["ministryLeader"],
  });

  const volunteer = await User.create({
    churchId: church._id,
    name: "Voluntário Teste",
    email: "voluntario@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  volunteerId = String(volunteer._id);

  const member = await User.create({
    churchId: church._id,
    name: "Membro Comum",
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

  const ministry = await Ministry.create({
    churchId: church._id,
    name: "Louvor",
    contractRequired: false,
    leader: leader._id,
  });
  ministryId = String(ministry._id);

  const otherMinistry = await Ministry.create({
    churchId: church._id,
    name: "Ensino Infantil",
    contractRequired: false,
    leader: otherLeader._id,
  });
  otherMinistryId = String(otherMinistry._id);

  leaderAccessToken = signAccessToken({ sub: leaderId, churchId, roles: ["ministryLeader"] });
  otherLeaderAccessToken = signAccessToken({
    sub: String(otherLeader._id),
    churchId,
    roles: ["ministryLeader"],
  });
  volunteerAccessToken = signAccessToken({ sub: volunteerId, churchId, roles: ["member"] });
  memberAccessToken = signAccessToken({ sub: String(member._id), churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });

  await request(app)
    .post(`/athos_adm/api/ministries/${ministryId}/volunteers`)
    .set("Authorization", `Bearer ${adminAccessToken}`)
    .send({ userId: volunteerId });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("PUT /athos_adm/api/ministries/:id/service-functions", () => {
  it("rejeita quem não é líder daquele ministério nem admin", async () => {
    const response = await request(app)
      .put(`/athos_adm/api/ministries/${ministryId}/service-functions`)
      .set("Authorization", `Bearer ${otherLeaderAccessToken}`)
      .send({ functions: [{ name: "Instrumento" }] });

    expect(response.status).toBe(403);
  });

  it("o líder do ministério cria a lista de funções", async () => {
    const response = await request(app)
      .put(`/athos_adm/api/ministries/${ministryId}/service-functions`)
      .set("Authorization", `Bearer ${leaderAccessToken}`)
      .send({ functions: [{ name: "Instrumento" }, { name: "Vocal" }, { name: "Mesa" }, { name: "Datashow" }] });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(4);
    instrumentoFunctionId = response.body.data.find((f: { name: string }) => f.name === "Instrumento").id;
    vocalFunctionId = response.body.data.find((f: { name: string }) => f.name === "Vocal").id;
  });

  it("GET lista as funções para qualquer autenticado da igreja", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}/service-functions`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(4);
  });
});

describe("GET /athos_adm/api/ministries/:id/volunteers", () => {
  it("lista voluntários ativos do ministério", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}/volunteers`)
      .set("Authorization", `Bearer ${leaderAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.some((v: { userId: string }) => v.userId === volunteerId)).toBe(true);
  });
});

describe("POST /athos_adm/api/ministries/:id/schedules", () => {
  it("rejeita quem não é líder daquele ministério nem admin", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/ministries/${ministryId}/schedules`)
      .set("Authorization", `Bearer ${otherLeaderAccessToken}`)
      .send({
        date: "2026-09-06T12:00:00.000Z",
        assignments: [{ functionId: instrumentoFunctionId, volunteerIds: [volunteerId] }],
      });

    expect(response.status).toBe(403);
  });

  it("rejeita functionId que não existe no ministério", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/ministries/${ministryId}/schedules`)
      .set("Authorization", `Bearer ${leaderAccessToken}`)
      .send({
        date: "2026-09-06T12:00:00.000Z",
        assignments: [{ functionId: String(new mongoose.Types.ObjectId()), volunteerIds: [volunteerId] }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_FUNCTION");
  });

  it("rejeita voluntário que não é ativo do ministério", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/ministries/${ministryId}/schedules`)
      .set("Authorization", `Bearer ${leaderAccessToken}`)
      .send({
        date: "2026-09-06T12:00:00.000Z",
        assignments: [{ functionId: instrumentoFunctionId, volunteerIds: [String(new mongoose.Types.ObjectId())] }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_VOLUNTEER");
  });

  it("o líder cria a escala com múltiplos voluntários por função", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/ministries/${ministryId}/schedules`)
      .set("Authorization", `Bearer ${leaderAccessToken}`)
      .send({
        date: "2026-09-06T12:00:00.000Z",
        title: "Culto de domingo",
        assignments: [
          { functionId: instrumentoFunctionId, volunteerIds: [volunteerId] },
          { functionId: vocalFunctionId, volunteerIds: [volunteerId] },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe("Culto de domingo");
    expect(response.body.data.assignments).toHaveLength(2);
    expect(response.body.data.assignments[0].volunteerIds).toContain(volunteerId);
    expect(response.body.data.assignments[0].volunteerNames).toContain("Voluntário Teste");
  });
});

describe("GET /athos_adm/api/ministries/:id/schedules", () => {
  it("lista escalas do ministério", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}/schedules`)
      .set("Authorization", `Bearer ${leaderAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("outro ministério não enxerga a escala deste", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/ministries/${otherMinistryId}/schedules`)
      .set("Authorization", `Bearer ${otherLeaderAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });
});

describe("PATCH e DELETE /athos_adm/api/ministries/:id/schedules/:scheduleId", () => {
  it("admin edita a escala", async () => {
    const list = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}/schedules`)
      .set("Authorization", `Bearer ${leaderAccessToken}`);
    const scheduleId = list.body.data[0].id;

    const response = await request(app)
      .patch(`/athos_adm/api/ministries/${ministryId}/schedules/${scheduleId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ notes: "Chegar 30min antes" });

    expect(response.status).toBe(200);
    expect(response.body.data.notes).toBe("Chegar 30min antes");
  });

  it("líder remove a escala", async () => {
    const list = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}/schedules`)
      .set("Authorization", `Bearer ${leaderAccessToken}`);
    const scheduleId = list.body.data[0].id;

    const response = await request(app)
      .delete(`/athos_adm/api/ministries/${ministryId}/schedules/${scheduleId}`)
      .set("Authorization", `Bearer ${leaderAccessToken}`);

    expect(response.status).toBe(204);

    const getResponse = await request(app)
      .get(`/athos_adm/api/ministries/${ministryId}/schedules/${scheduleId}`)
      .set("Authorization", `Bearer ${leaderAccessToken}`);

    expect(getResponse.status).toBe(404);
  });
});
