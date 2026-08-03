import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let memberAccessToken: string;
let otherMemberAccessToken: string;
let adminAccessToken: string;
let otherChurchAdminAccessToken: string;
let freeEventId: string;
let paidEventId: string;

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

  const otherChurchAdmin = await User.create({
    churchId: otherChurch._id,
    name: "Admin Outra Igreja",
    email: "admin2@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  memberAccessToken = signAccessToken({ sub: String(member._id), churchId, roles: ["member"] });
  otherMemberAccessToken = signAccessToken({ sub: String(otherMember._id), churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  otherChurchAdminAccessToken = signAccessToken({
    sub: String(otherChurchAdmin._id),
    churchId: String(otherChurch._id),
    roles: ["admin"],
  });

  const freeEvent = await Event.create({
    churchId: church._id,
    title: "Culto de Celebração",
    imageUrl: "https://example.com/event1.png",
    date: new Date("2026-08-01T19:00:00.000Z"),
  });
  freeEventId = String(freeEvent._id);

  const paidEvent = await Event.create({
    churchId: church._id,
    title: "Retiro de Jovens",
    imageUrl: "https://example.com/event2.png",
    date: new Date("2026-09-01T19:00:00.000Z"),
    price: 150,
  });
  paidEventId = String(paidEvent._id);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/events/:id/register", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).post(`/athos_adm/api/events/${freeEventId}/register`).send({});

    expect(response.status).toBe(401);
  });

  it("retorna 404 para evento de outra igreja", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/events/${freeEventId}/register`)
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`)
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("EVENT_NOT_FOUND");
  });

  it("inscreve em evento gratuito diretamente como attending", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/events/${freeEventId}/register`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({});

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("attending");
    expect(response.body.data.eventId).toBe(freeEventId);
    expect(response.body.data.clientSecret).toBeUndefined();
  });

  it("rejeita segunda inscrição no mesmo evento", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/events/${freeEventId}/register`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ALREADY_REGISTERED");
  });

  it("inscreve em evento pago como registered e retorna checkout", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/events/${paidEventId}/register`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ provider: "mercadopago" });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("registered");
    expect(response.body.data.paymentId).toBeTruthy();
    expect(response.body.data.clientSecret).toBeTruthy();
    expect(response.body.data.pixQrCode).toBeTruthy();
  });
});

describe("GET /athos_adm/api/events/registrations", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/events/registrations");

    expect(response.status).toBe(401);
  });

  it("lista apenas as inscrições do próprio usuário", async () => {
    const response = await request(app)
      .get("/athos_adm/api/events/registrations")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(2);

    const otherResponse = await request(app)
      .get("/athos_adm/api/events/registrations")
      .set("Authorization", `Bearer ${otherMemberAccessToken}`);

    expect(otherResponse.status).toBe(200);
    expect(otherResponse.body.data.length).toBe(0);
  });

  it("filtra por status", async () => {
    const response = await request(app)
      .get("/athos_adm/api/events/registrations?status=registered")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].eventId).toBe(paidEventId);
  });
});

describe("PATCH /athos_adm/api/events/registrations/:id", () => {
  let registrationId: string;

  beforeAll(async () => {
    const response = await request(app)
      .get("/athos_adm/api/events/registrations?status=attending")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    registrationId = response.body.data[0].id;
  });

  it("rejeita usuário tentando alterar para status diferente de cancelled", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/events/registrations/${registrationId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ status: "attended" });

    expect(response.status).toBe(403);
  });

  it("retorna 404 para outro usuário tentando cancelar inscrição alheia", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/events/registrations/${registrationId}`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`)
      .send({ status: "cancelled" });

    expect(response.status).toBe(404);
  });

  it("permite que o dono cancele a própria inscrição", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/events/registrations/${registrationId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ status: "cancelled" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("cancelled");
  });

  it("admin pode alterar para qualquer status", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/events/registrations/${registrationId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ status: "attended" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("attended");
  });
});

describe("Webhook de pagamento confirma inscrição paga", () => {
  it("atualiza EventRegistration para attending quando a Offering relacionada é paga", async () => {
    const registerResponse = await request(app)
      .post(`/athos_adm/api/events/${paidEventId}/register`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`)
      .send({});

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.data.status).toBe("registered");

    const { Offering } = await import("../models/Offering.model");
    const offering = await Offering.findById(registerResponse.body.data.paymentId);
    expect(offering).toBeTruthy();

    const webhookResponse = await request(app).post("/athos_adm/api/payments/webhook").send({
      provider: offering!.provider,
      providerPaymentId: offering!.providerPaymentId,
      status: "paid",
    });

    expect(webhookResponse.status).toBe(200);

    const registrationsResponse = await request(app)
      .get("/athos_adm/api/events/registrations?status=attending")
      .set("Authorization", `Bearer ${otherMemberAccessToken}`);

    expect(registrationsResponse.status).toBe(200);
    expect(
      registrationsResponse.body.data.some(
        (registration: { eventId: string }) => registration.eventId === paidEventId,
      ),
    ).toBe(true);
  });
});
