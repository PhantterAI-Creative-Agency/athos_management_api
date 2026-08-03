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
let devAdminAccessToken: string;
let otherChurchId: string;

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
  otherChurchId = String(otherChurch._id);

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

  const devAdmin = await User.create({
    churchId: church._id,
    name: "Dev Admin",
    email: "devadmin@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["devAdmin"],
  });

  memberAccessToken = signAccessToken({ sub: memberId, churchId, roles: ["member"] });
  otherMemberAccessToken = signAccessToken({ sub: otherMemberId, churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  otherChurchAdminAccessToken = signAccessToken({
    sub: String(otherChurchAdmin._id),
    churchId: otherChurchId,
    roles: ["admin"],
  });
  devAdminAccessToken = signAccessToken({ sub: String(devAdmin._id), churchId, roles: ["devAdmin"] });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/offerings", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app)
      .post("/athos_adm/api/offerings")
      .send({ type: "donation", amount: 50 });

    expect(response.status).toBe(401);
  });

  it("cria uma doação pendente e retorna clientSecret", async () => {
    const response = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 100 });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("pending");
    expect(response.body.data.type).toBe("donation");
    expect(response.body.data.amount).toBe(100);
    expect(response.body.data.currency).toBe("BRL");
    expect(response.body.data.provider).toBe("stripe");
    expect(response.body.data.clientSecret).toEqual(expect.any(String));
    expect(response.body.data.providerPaymentId).toEqual(expect.any(String));
  });

  it("valida valor positivo", async () => {
    const response = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: -10 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejeita tipo event_registration (reservado ao fluxo de inscrição em evento)", async () => {
    const response = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "event_registration", amount: 50 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("cria uma doação via Mercado Pago e retorna QR Code/copia-e-cola do Pix", async () => {
    const response = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 25, provider: "mercadopago" });

    expect(response.status).toBe(201);
    expect(response.body.data.provider).toBe("mercadopago");
    expect(response.body.data.pixQrCode).toEqual(expect.any(String));
    expect(response.body.data.pixCopyPaste).toEqual(expect.any(String));
  });

  it("não retorna campos de Pix para provedores sem Pix nativo (ex.: stripe)", async () => {
    const response = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 25, provider: "stripe" });

    expect(response.status).toBe(201);
    expect(response.body.data.pixQrCode).toBeUndefined();
    expect(response.body.data.pixCopyPaste).toBeUndefined();
  });

  it("rejeita provedor desconhecido", async () => {
    const response = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 25, provider: "picpay" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /athos_adm/api/offerings", () => {
  it("lista apenas as ofertas do próprio usuário por padrão", async () => {
    await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${otherMemberAccessToken}`)
      .send({ type: "contribution", amount: 30 });

    const response = await request(app)
      .get("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((offering: { userId: string }) => offering.userId === memberId),
    ).toBe(true);
  });

  it("admin pode listar as ofertas de outro usuário da mesma igreja via ?userId=", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/offerings?userId=${otherMemberId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((offering: { userId: string }) => offering.userId === otherMemberId),
    ).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it("membro comum não consegue ver ofertas de outro usuário mesmo pedindo ?userId=", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/offerings?userId=${otherMemberId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((offering: { userId: string }) => offering.userId === memberId),
    ).toBe(true);
  });

  it("devAdmin pode listar ofertas de outra igreja via churchId + userId", async () => {
    const otherChurchOffering = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`)
      .send({ type: "donation", amount: 20 });

    expect(otherChurchOffering.status).toBe(201);

    const response = await request(app)
      .get(`/athos_adm/api/offerings?churchId=${otherChurchId}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((offering: { churchId: string }) => offering.churchId === otherChurchId),
    ).toBe(true);
  });
});

describe("GET /athos_adm/api/offerings/summary", () => {
  it("soma apenas ofertas pagas do usuário", async () => {
    const created = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 75 });

    await request(app).post("/athos_adm/api/payments/webhook").send({
      provider: "stripe",
      providerPaymentId: created.body.data.providerPaymentId,
      status: "paid",
    });

    const response = await request(app)
      .get("/athos_adm/api/offerings/summary")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.totalPaid).toBeGreaterThanOrEqual(75);
    expect(response.body.data.year).toBe("all");
  });

  it("filtra o resumo por ano", async () => {
    const nextYear = new Date().getUTCFullYear() + 1;

    const response = await request(app)
      .get(`/athos_adm/api/offerings/summary?year=${nextYear}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.totalPaid).toBe(0);
    expect(response.body.data.count).toBe(0);
    expect(response.body.data.year).toBe(nextYear);
  });
});

describe("GET /athos_adm/api/offerings/:id", () => {
  it("permite que o próprio usuário veja sua oferta", async () => {
    const created = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 10 });

    const response = await request(app)
      .get(`/athos_adm/api/offerings/${created.body.data.id}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(created.body.data.id);
  });

  it("rejeita outro membro comum tentando ver oferta alheia", async () => {
    const created = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 10 });

    const response = await request(app)
      .get(`/athos_adm/api/offerings/${created.body.data.id}`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("OFFERING_NOT_FOUND");
  });

  it("admin da mesma igreja pode ver a oferta", async () => {
    const created = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 10 });

    const response = await request(app)
      .get(`/athos_adm/api/offerings/${created.body.data.id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(200);
  });

  it("admin de outra igreja não encontra a oferta", async () => {
    const created = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 10 });

    const response = await request(app)
      .get(`/athos_adm/api/offerings/${created.body.data.id}`)
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`);

    expect(response.status).toBe(404);
  });

  it("devAdmin pode ver a oferta de qualquer igreja", async () => {
    const created = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 10 });

    const response = await request(app)
      .get(`/athos_adm/api/offerings/${created.body.data.id}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`);

    expect(response.status).toBe(200);
  });
});

describe("POST /athos_adm/api/payments/webhook", () => {
  it("confirma um pagamento Pix via Mercado Pago", async () => {
    const created = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 60, provider: "mercadopago" });

    const webhookResponse = await request(app).post("/athos_adm/api/payments/webhook").send({
      provider: "mercadopago",
      providerPaymentId: created.body.data.providerPaymentId,
      status: "paid",
    });

    expect(webhookResponse.status).toBe(200);

    const getResponse = await request(app)
      .get(`/athos_adm/api/offerings/${created.body.data.id}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(getResponse.body.data.status).toBe("paid");
  });

  it("confirma o pagamento e atualiza o status para paid", async () => {
    const created = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 42 });

    const webhookResponse = await request(app).post("/athos_adm/api/payments/webhook").send({
      provider: "stripe",
      providerPaymentId: created.body.data.providerPaymentId,
      status: "paid",
    });

    expect(webhookResponse.status).toBe(200);

    const getResponse = await request(app)
      .get(`/athos_adm/api/offerings/${created.body.data.id}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(getResponse.body.data.status).toBe("paid");
  });

  it("é idempotente ao reprocessar o mesmo evento", async () => {
    const created = await request(app)
      .post("/athos_adm/api/offerings")
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ type: "donation", amount: 15 });

    await request(app).post("/athos_adm/api/payments/webhook").send({
      provider: "stripe",
      providerPaymentId: created.body.data.providerPaymentId,
      status: "paid",
    });

    const secondAttempt = await request(app).post("/athos_adm/api/payments/webhook").send({
      provider: "stripe",
      providerPaymentId: created.body.data.providerPaymentId,
      status: "failed",
    });

    expect(secondAttempt.status).toBe(200);

    const getResponse = await request(app)
      .get(`/athos_adm/api/offerings/${created.body.data.id}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(getResponse.body.data.status).toBe("paid");
  });

  it("retorna 404 para providerPaymentId inexistente", async () => {
    const response = await request(app).post("/athos_adm/api/payments/webhook").send({
      provider: "stripe",
      providerPaymentId: "inexistente_123",
      status: "paid",
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("OFFERING_NOT_FOUND");
  });
});
