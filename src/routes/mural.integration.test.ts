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
let otherMemberAccessToken: string;
let adminAccessToken: string;
let otherChurchMemberAccessToken: string;
let ministryVolunteerAccessToken: string;
let ministryId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { Ministry } = await import("../models/Ministry.model");
  const { MinistryVolunteer } = await import("../models/MinistryVolunteer.model");
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

  const ministryVolunteerUser = await User.create({
    churchId: church._id,
    name: "Voluntário Louvor",
    email: "voluntario@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["volunteer"],
  });

  const ministry = await Ministry.create({
    churchId: church._id,
    name: "Louvor",
  });
  ministryId = String(ministry._id);

  await MinistryVolunteer.create({
    ministryId: ministry._id,
    userId: ministryVolunteerUser._id,
    churchId: church._id,
    active: true,
  });

  memberAccessToken = signAccessToken({ sub: memberId, churchId, roles: ["member"] });
  otherMemberAccessToken = signAccessToken({ sub: String(otherMember._id), churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  otherChurchMemberAccessToken = signAccessToken({
    sub: String(otherChurchMember._id),
    churchId: String(otherChurch._id),
    roles: ["member"],
  });
  ministryVolunteerAccessToken = signAccessToken({
    sub: String(ministryVolunteerUser._id),
    churchId,
    roles: ["volunteer"],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/mural", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).post("/athos_adm/api/mural").send({ content: "Olá igreja!" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("valida conteúdo vazio", async () => {
    const response = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ content: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("cria um post de usuário comum com audience padrão 'all'", async () => {
    const response = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ content: "Testemunho de hoje" });

    expect(response.status).toBe(201);
    expect(response.body.data.authorType).toBe("user");
    expect(response.body.data.authorId).toBe(memberId);
    expect(response.body.data.audience).toBe("all");
    expect(response.body.data.likesCount).toBe(0);
    expect(response.body.data.liked).toBe(false);
  });

  it("rejeita authorType 'church' de quem não é admin", async () => {
    const response = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ content: "Comunicado", authorType: "church" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("permite authorType 'church' para admin, usando o churchId como authorId", async () => {
    const response = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ content: "Comunicado oficial", authorType: "church" });

    expect(response.status).toBe(201);
    expect(response.body.data.authorType).toBe("church");
    expect(response.body.data.authorId).toBe(churchId);
  });

  it("exige audienceRefId quando audience não é 'all'", async () => {
    const response = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ content: "Post do ministério", audience: "ministry" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejeita audience 'ministry' de quem não é voluntário do ministério", async () => {
    const response = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ content: "Post do ministério", audience: "ministry", audienceRefId: ministryId });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("permite audience 'ministry' para voluntário ativo do ministério", async () => {
    const response = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${ministryVolunteerAccessToken}`)
      .send({ content: "Ensaio na quinta", audience: "ministry", audienceRefId: ministryId });

    expect(response.status).toBe(201);
    expect(response.body.data.audience).toBe("ministry");
    expect(response.body.data.audienceRefId).toBe(ministryId);
  });

  it("rejeita audience 'growthGroup' de quem não é admin", async () => {
    const response = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ content: "Post do GC", audience: "growthGroup", audienceRefId: ministryId });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});

describe("GET /athos_adm/api/mural", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/mural");

    expect(response.status).toBe(401);
  });

  it("isola o feed por igreja", async () => {
    const response = await request(app)
      .get("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${otherChurchMemberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([]);
    expect(response.body.data.nextCursor).toBeUndefined();
  });

  it("não mostra posts de audience 'ministry' para quem não é voluntário do ministério", async () => {
    const response = await request(app)
      .get("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${otherMemberAccessToken}`);

    expect(response.status).toBe(200);
    const audiences = response.body.data.items.map((item: { audience: string }) => item.audience);
    expect(audiences).not.toContain("ministry");
  });

  it("mostra posts de audience 'ministry' para voluntário do ministério", async () => {
    const response = await request(app)
      .get("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${ministryVolunteerAccessToken}`);

    expect(response.status).toBe(200);
    const audiences = response.body.data.items.map((item: { audience: string }) => item.audience);
    expect(audiences).toContain("ministry");
  });

  it("admin vê todos os posts da própria igreja, incluindo audience 'ministry'", async () => {
    const response = await request(app)
      .get("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(200);
    const audiences = response.body.data.items.map((item: { audience: string }) => item.audience);
    expect(audiences).toContain("ministry");
  });

  it("pagina o feed via cursor", async () => {
    const firstPage = await request(app)
      .get("/athos_adm/api/mural")
      .query({ limit: 2 })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.items).toHaveLength(2);
    expect(firstPage.body.data.nextCursor).toBeTruthy();

    const secondPage = await request(app)
      .get("/athos_adm/api/mural")
      .query({ limit: 2, cursor: firstPage.body.data.nextCursor })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(secondPage.status).toBe(200);
    const firstIds = firstPage.body.data.items.map((item: { id: string }) => item.id);
    const secondIds = secondPage.body.data.items.map((item: { id: string }) => item.id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
  });

  it("rejeita cursor inválido", async () => {
    const response = await request(app)
      .get("/athos_adm/api/mural")
      .query({ cursor: "cursor-invalido" })
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /athos_adm/api/mural/:id/like", () => {
  let postId: string;

  beforeAll(async () => {
    const response = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ content: "Post para curtir" });
    postId = response.body.data.id;
  });

  it("rejeita requisição sem token", async () => {
    const response = await request(app).post(`/athos_adm/api/mural/${postId}/like`);

    expect(response.status).toBe(401);
  });

  it("404 em post de outra igreja / inexistente", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/mural/${postId}/like`)
      .set("Authorization", `Bearer ${otherChurchMemberAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("MURAL_POST_NOT_FOUND");
  });

  it("curte o post na primeira chamada", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/mural/${postId}/like`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ liked: true, likesCount: 1 });
  });

  it("descurte o post na segunda chamada (toggle)", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/mural/${postId}/like`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ liked: false, likesCount: 0 });
  });
});

describe("DELETE /athos_adm/api/mural/:id", () => {
  let postId: string;

  beforeAll(async () => {
    const response = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ content: "Post para remover" });
    postId = response.body.data.id;
  });

  it("rejeita requisição sem token", async () => {
    const response = await request(app).delete(`/athos_adm/api/mural/${postId}`);

    expect(response.status).toBe(401);
  });

  it("rejeita remoção por outro membro que não é autor nem admin", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/mural/${postId}`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("404 para post de outra igreja / inexistente", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/mural/${postId}`)
      .set("Authorization", `Bearer ${otherChurchMemberAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("MURAL_POST_NOT_FOUND");
  });

  it("permite remoção pelo próprio autor", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/mural/${postId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(204);
  });

  it("permite remoção por admin mesmo não sendo autor", async () => {
    const created = await request(app)
      .post("/athos_adm/api/mural")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ content: "Outro post para remover" });

    const response = await request(app)
      .delete(`/athos_adm/api/mural/${created.body.data.id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(204);
  });
});
