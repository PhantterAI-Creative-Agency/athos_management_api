import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

const API = "/athos_adm/api";

let mongod: MongoMemoryServer;
let app: Express;
let adminToken: string;
let memberToken: string;
let paidEventId: string;
let secondPaidEventId: string;

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

  const church = await Church.create({ name: "Igreja PIX", logoUrl: "x", slug: "igreja-pix" });
  const churchId = String(church._id);
  const passwordHash = await hashPassword("senha123");
  const admin = await User.create({ churchId, name: "Admin", email: "a@pix.com", passwordHash, roles: ["admin"] });
  const member = await User.create({ churchId, name: "Membro", email: "m@pix.com", passwordHash, roles: ["member"] });
  adminToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  memberToken = signAccessToken({ sub: String(member._id), churchId, roles: ["member"] });

  const mkEvent = (title: string) =>
    Event.create({ churchId, title, imageUrl: "x", date: new Date("2026-12-20T19:00:00Z"), price: 80 });
  paidEventId = String((await mkEvent("Acampamento"))._id);
  secondPaidEventId = String((await mkEvent("Retiro"))._id);
});

afterEach(() => {
  delete process.env.PAYMENTS_MOCK_ENABLED;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("Chave PIX da igreja (painel)", () => {
  it("membro não altera a chave", async () => {
    const res = await request(app)
      .put(`${API}/churches/me/pix`)
      .set(auth(memberToken))
      .send({ keyType: "email", key: "x@y.com", receiverName: "Igreja", city: "Recife" });
    expect(res.status).toBe(403);
  });

  it("começa sem chave e a oferta PIX informa que não há chave", async () => {
    const config = await request(app).get(`${API}/churches/me/pix`).set(auth(adminToken));
    expect(config.status).toBe(200);
    expect(config.body.data).toBeNull();

    const charge = await request(app).get(`${API}/offerings/pix`).set(auth(memberToken));
    expect(charge.status).toBe(404);
    expect(charge.body.error.code).toBe("PIX_NOT_CONFIGURED");
  });

  it("valida a chave conforme o tipo", async () => {
    const res = await request(app)
      .put(`${API}/churches/me/pix`)
      .set(auth(adminToken))
      .send({ keyType: "cnpj", key: "11.222.333/0001-00", receiverName: "Igreja", city: "Recife" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_PIX_KEY");
  });

  it("salva a chave normalizada", async () => {
    const res = await request(app)
      .put(`${API}/churches/me/pix`)
      .set(auth(adminToken))
      .send({ keyType: "cnpj", key: "11.222.333/0001-81", receiverName: "Igreja Pix Recife", city: "Recife" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      keyType: "cnpj",
      key: "11222333000181",
      keyFormatted: "11.222.333/0001-81",
    });
  });
});

describe("Oferta pela chave PIX estática", () => {
  it("gera copia e cola e QR Code, com valor e descrição", async () => {
    const res = await request(app).get(`${API}/offerings/pix?amount=35.5&type=contribution`).set(auth(memberToken));
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.payload.startsWith("000201")).toBe(true);
    expect(data.payload).toContain("11222333000181");
    expect(data.payload).toContain("540535.50");
    expect(data.payload).toContain("Dizimo");
    expect(data.qrCodeDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(data.automaticConfirmation).toBe(false);
  });

  it("sem valor, o pagador digita no app do banco", async () => {
    const res = await request(app).get(`${API}/offerings/pix`).set(auth(memberToken));
    expect(res.body.data.payload).not.toMatch(/54\d{2}\d+\.\d{2}58/);
  });

  it("respeita o recurso de ofertas desligado", async () => {
    await request(app).patch(`${API}/churches/me/features`).set(auth(adminToken)).send({ onlineOfferings: false });
    const res = await request(app).get(`${API}/offerings/pix`).set(auth(memberToken));
    expect(res.status).toBe(403);
    await request(app).patch(`${API}/churches/me/features`).set(auth(adminToken)).send({ onlineOfferings: true });
  });
});

describe("Sem pagamento simulado (produção)", () => {
  it("não cria cobrança on-line falsa", async () => {
    process.env.PAYMENTS_MOCK_ENABLED = "false";
    const res = await request(app)
      .post(`${API}/offerings`)
      .set(auth(memberToken))
      .send({ type: "donation", amount: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ONLINE_PAYMENTS_UNAVAILABLE");
  });

  it("inscrição paga fica aguardando e devolve o PIX da igreja com o id da inscrição", async () => {
    process.env.PAYMENTS_MOCK_ENABLED = "false";
    const res = await request(app).post(`${API}/events/${paidEventId}/register`).set(auth(memberToken)).send({});
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("registered");
    expect(res.body.data.paymentConfirmation).toBe("manual");
    expect(res.body.data.pixCopyPaste).toContain("540580.00");
    expect(res.body.data.pixCopyPaste).toContain(res.body.data.id);
    expect(res.body.data.pixQrCode.startsWith("data:image/png")).toBe(true);
    expect(res.body.data.pixKey.keyFormatted).toBe("11.222.333/0001-81");
  });

  it("sem chave cadastrada, a inscrição ainda é feita (pagamento combinado com a igreja)", async () => {
    await request(app).delete(`${API}/churches/me/pix`).set(auth(adminToken)).expect(204);
    process.env.PAYMENTS_MOCK_ENABLED = "false";
    const res = await request(app).post(`${API}/events/${secondPaidEventId}/register`).set(auth(memberToken)).send({});
    expect(res.status).toBe(201);
    expect(res.body.data.paymentConfirmation).toBe("manual");
    expect(res.body.data.pixCopyPaste).toBeUndefined();
  });
});

describe("Webhook de pagamentos protegido", () => {
  const body = { provider: "mercadopago", providerPaymentId: "qualquer", status: "paid" };

  it("recusa sem o segredo", async () => {
    const res = await request(app).post(`${API}/payments/webhook`).send(body);
    expect(res.status).toBe(401);
  });

  it("recusa segredo errado", async () => {
    const res = await request(app).post(`${API}/payments/webhook`).set("X-Webhook-Secret", "errado").send(body);
    expect(res.status).toBe(401);
  });

  it("fica desligado quando não há segredo configurado", async () => {
    const saved = process.env.PAYMENT_WEBHOOK_SECRET;
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    try {
      const res = await request(app).post(`${API}/payments/webhook`).set("X-Webhook-Secret", "x").send(body);
      expect(res.status).toBe(404);
    } finally {
      process.env.PAYMENT_WEBHOOK_SECRET = saved;
    }
  });
});
