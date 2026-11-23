import crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

const API = "/athos_adm/api";
const WEBHOOK_SECRET = "mp-webhook-secret";

let mongod: MongoMemoryServer;
let app: Express;
let memberToken: string;
let noEmailToken: string;
let churchId: string;
let paidEventId: string;

// Mercado Pago simulado: guarda os pagamentos criados e responde à consulta.
type FakePayment = Record<string, unknown> & { id: number; status: string; transaction_amount: number; external_reference: string };
const payments = new Map<string, FakePayment>();
const requests: { method: string; path: string; headers: Record<string, string>; body?: Record<string, unknown> }[] = [];
let failNextCreate = false;
let nextId = 9000;

function installFakeMercadoPago() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method: init?.method ?? "GET", path: url.pathname, headers, body });
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

    if (headers.Authorization !== "Bearer APP_USR-church-token") return json(401, { message: "unauthorized" });

    if (init?.method === "POST" && url.pathname === "/v1/payments") {
      if (failNextCreate) {
        failNextCreate = false;
        return json(400, { message: "invalid payer" });
      }
      const id = nextId++;
      const payment: FakePayment = {
        id,
        status: "pending",
        status_detail: "pending_waiting_transfer",
        transaction_amount: body.transaction_amount,
        external_reference: body.external_reference,
        date_of_expiration: body.date_of_expiration,
        point_of_interaction: { transaction_data: { qr_code: `00020126pix-${id}`, qr_code_base64: "iVBORw0KGgo=" } },
      };
      payments.set(String(id), payment);
      return json(201, payment);
    }
    const match = /^\/v1\/payments\/(\d+)$/.exec(url.pathname);
    if (match) {
      const payment = payments.get(match[1]);
      return payment ? json(200, payment) : json(404, { message: "not found" });
    }
    return json(404, { message: "unknown" });
  });
}

function sign(dataId: string, requestId: string, ts = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

function notify(paymentId: string, opts: { signature?: string; body?: Record<string, unknown> } = {}) {
  const requestId = crypto.randomUUID();
  return request(app)
    .post(`${API}/payments/mercadopago/webhook?data.id=${paymentId}&type=payment`)
    .set("x-request-id", requestId)
    .set("x-signature", opts.signature ?? sign(paymentId, requestId))
    .send(opts.body ?? { type: "payment", action: "payment.updated", data: { id: paymentId } });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { Event } = await import("../models/Event.model");
  const { PaymentAccount } = await import("../models/PaymentAccount.model");
  const { encryptSecret } = await import("../helpers/crypto.helper");
  const { hashPassword } = await import("../helpers/password.helper");
  const { signAccessToken } = await import("../helpers/jwt.helper");

  await connectDB(process.env.MONGODB_URI);
  app = createApp();

  const church = await Church.create({ name: "Igreja Pagamentos", logoUrl: "x", slug: "igreja-pag" });
  churchId = String(church._id);
  const passwordHash = await hashPassword("senha123");
  const member = await User.create({ churchId, name: "Maria Silva", email: "maria@pag.com", passwordHash, roles: ["member"] });
  const noEmail = await User.create({ churchId, name: "Sem Email", username: "semmail", passwordHash, roles: ["member"] });
  memberToken = signAccessToken({ sub: String(member._id), churchId, roles: ["member"] });
  noEmailToken = signAccessToken({ sub: String(noEmail._id), churchId, roles: ["member"] });

  await PaymentAccount.create({
    churchId,
    status: "connected",
    mpUserId: "555",
    accessTokenEnc: encryptSecret("APP_USR-church-token"),
    refreshTokenEnc: encryptSecret("TG-refresh"),
    expiresAt: new Date(Date.now() + 150 * 86_400_000),
  });

  paidEventId = String(
    (await Event.create({ churchId, title: "Conferência", imageUrl: "x", date: new Date("2026-12-20T19:00:00Z"), price: 120 }))._id,
  );
});

beforeEach(() => {
  process.env.PAYMENTS_MOCK_ENABLED = "false";
  process.env.MP_WEBHOOK_SECRET = WEBHOOK_SECRET;
  installFakeMercadoPago();
});

afterEach(() => {
  vi.restoreAllMocks();
  requests.length = 0;
  delete process.env.PAYMENTS_MOCK_ENABLED;
  delete process.env.MP_WEBHOOK_SECRET;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createOffering(amount = 50) {
  const res = await request(app).post(`${API}/offerings`).set(auth(memberToken)).send({ type: "contribution", amount });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; providerPaymentId: string; status: string; pixCopyPaste: string; pixQrCode: string; expiresAt: string };
}

describe("Opções de pagamento", () => {
  it("igreja conectada usa o Mercado Pago", async () => {
    const res = await request(app).get(`${API}/offerings/payment-options`).set(auth(memberToken));
    expect(res.body.data).toEqual({ mode: "mercadopago", staticPixAvailable: false });
  });
});

describe("Cobrança PIX na conta da igreja", () => {
  it("cria o PIX com o token da igreja, sem taxa da plataforma e com chave de idempotência", async () => {
    const offering = await createOffering(50);
    expect(offering.status).toBe("pending");
    expect(offering.pixCopyPaste).toBe(`00020126pix-${offering.providerPaymentId}`);
    expect(offering.pixQrCode).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(new Date(offering.expiresAt).getTime()).toBeGreaterThan(Date.now() + 50 * 60 * 1000);

    const call = requests.find((r) => r.method === "POST")!;
    expect(call.headers.Authorization).toBe("Bearer APP_USR-church-token");
    expect(call.headers["X-Idempotency-Key"]).toBe(offering.id);
    expect(call.body).toMatchObject({
      transaction_amount: 50,
      payment_method_id: "pix",
      external_reference: offering.id,
      payer: { email: "maria@pag.com", first_name: "Maria" },
      notification_url: "https://api.exemplo.org/athos_adm/api/payments/mercadopago/webhook",
    });
    expect(call.body).not.toHaveProperty("application_fee");
    expect(call.body).not.toHaveProperty("marketplace_fee");
    expect(String(call.body!.date_of_expiration)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-03:00$/);
  });

  it("exige e-mail do pagador", async () => {
    const res = await request(app).post(`${API}/offerings`).set(auth(noEmailToken)).send({ type: "donation", amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PAYER_EMAIL_REQUIRED");
  });

  it("falha do Mercado Pago não grava oferta", async () => {
    const { Offering } = await import("../models/Offering.model");
    const before = await Offering.countDocuments();
    failNextCreate = true;
    const res = await request(app).post(`${API}/offerings`).set(auth(memberToken)).send({ type: "donation", amount: 10 });
    expect(res.status).toBe(502);
    expect(await Offering.countDocuments()).toBe(before);
  });
});

describe("Webhook", () => {
  it("recusa assinatura inválida", async () => {
    const offering = await createOffering();
    payments.get(offering.providerPaymentId)!.status = "approved";
    const res = await notify(offering.providerPaymentId, { signature: "ts=1,v1=abc" });
    expect(res.status).toBe(401);
    const check = await request(app).get(`${API}/offerings/${offering.id}`).set(auth(memberToken));
    expect(check.body.data.status).toBe("pending");
  });

  it("confirma o pagamento consultando o Mercado Pago, e repetir não muda nada", async () => {
    const offering = await createOffering(75);
    payments.get(offering.providerPaymentId)!.status = "approved";
    payments.get(offering.providerPaymentId)!.date_approved = "2026-11-23T10:00:00.000-03:00";

    expect((await notify(offering.providerPaymentId)).status).toBe(200);
    let check = await request(app).get(`${API}/offerings/${offering.id}`).set(auth(memberToken));
    expect(check.body.data.status).toBe("paid");
    expect(check.body.data.paidAt).toBe("2026-11-23T13:00:00.000Z");
    expect(check.body.data.pixCopyPaste).toBeUndefined();

    expect(requests.some((r) => r.method === "GET" && r.path === `/v1/payments/${offering.providerPaymentId}`)).toBe(true);

    expect((await notify(offering.providerPaymentId)).status).toBe(200);
    check = await request(app).get(`${API}/offerings/${offering.id}`).set(auth(memberToken));
    expect(check.body.data.status).toBe("paid");
  });

  it("não confia no corpo da notificação", async () => {
    const offering = await createOffering();
    // O Mercado Pago diz "pending"; a notificação forjada diz "approved".
    const res = await notify(offering.providerPaymentId, {
      body: { type: "payment", data: { id: offering.providerPaymentId }, status: "approved" },
    });
    expect(res.status).toBe(200);
    const check = await request(app).get(`${API}/offerings/${offering.id}`).set(auth(memberToken));
    expect(check.body.data.status).toBe("pending");
  });

  it("valor divergente não confirma", async () => {
    const offering = await createOffering(100);
    Object.assign(payments.get(offering.providerPaymentId)!, { status: "approved", transaction_amount: 1 });
    await notify(offering.providerPaymentId);
    const check = await request(app).get(`${API}/offerings/${offering.id}`).set(auth(memberToken));
    expect(check.body.data.status).toBe("failed");
  });

  it("referência de outra oferta não altera nada", async () => {
    const offering = await createOffering();
    Object.assign(payments.get(offering.providerPaymentId)!, { status: "approved", external_reference: "outra" });
    await notify(offering.providerPaymentId);
    const check = await request(app).get(`${API}/offerings/${offering.id}`).set(auth(memberToken));
    expect(check.body.data.status).toBe("pending");
  });

  it("ignora pagamentos desconhecidos e outros tipos de notificação", async () => {
    payments.set("777", { id: 777, status: "approved", transaction_amount: 1, external_reference: "x" });
    expect((await notify("777")).status).toBe(200);
    const res = await request(app)
      .post(`${API}/payments/mercadopago/webhook?data.id=123&type=merchant_order`)
      .set("x-request-id", "r1")
      .set("x-signature", sign("123", "r1"))
      .send({ type: "merchant_order", data: { id: "123" } });
    expect(res.body.data.ignored).toBe(true);
  });

  it("estorno depois de pago vira reembolsado", async () => {
    const offering = await createOffering(30);
    payments.get(offering.providerPaymentId)!.status = "approved";
    await notify(offering.providerPaymentId);
    payments.get(offering.providerPaymentId)!.status = "refunded";
    await notify(offering.providerPaymentId);
    const check = await request(app).get(`${API}/offerings/${offering.id}`).set(auth(memberToken));
    expect(check.body.data.status).toBe("refunded");
  });
});

describe("Inscrição em evento pago", () => {
  it("gera o PIX e confirma a inscrição quando o pagamento é aprovado", async () => {
    const res = await request(app).post(`${API}/events/${paidEventId}/register`).set(auth(memberToken)).send({});
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "registered", paymentConfirmation: "automatic" });
    expect(res.body.data.pixCopyPaste).toMatch(/^00020126pix-/);
    const call = requests.find((r) => r.method === "POST")!;
    expect(call.body).toMatchObject({ transaction_amount: 120 });
    expect(String(call.body!.description)).toContain("Conferência");

    const paymentId = String(call.body && [...payments.values()].find((p) => p.transaction_amount === 120)!.id);
    payments.get(paymentId)!.status = "approved";
    await notify(paymentId);

    const { EventRegistration } = await import("../models/EventRegistration.model");
    const registration = await EventRegistration.findById(res.body.data.id).lean();
    expect(registration?.status).toBe("attending");
  });
});

describe("Conciliação (notificações perdidas)", () => {
  const cron = () =>
    request(app).post(`${API}/internal/cron/mercadopago-reconcile`).set("Authorization", "Bearer test-cron-secret");

  it("exige o segredo do cron", async () => {
    expect((await request(app).post(`${API}/internal/cron/mercadopago-reconcile`)).status).toBe(401);
  });

  it("confirma pagos e expira PIX vencidos", async () => {
    const { Offering } = await import("../models/Offering.model");
    const paid = await createOffering(40);
    const expired = await createOffering(41);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await Offering.collection.updateMany(
      { _id: { $in: [new mongoose.Types.ObjectId(paid.id), new mongoose.Types.ObjectId(expired.id)] } },
      { $set: { createdAt: old } },
    );
    await Offering.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(expired.id) },
      { $set: { expiresAt: new Date(Date.now() - 60 * 60 * 1000) } },
    );
    payments.get(paid.providerPaymentId)!.status = "approved";
    payments.get(expired.providerPaymentId)!.status = "cancelled";

    const res = await cron();
    expect(res.status).toBe(200);
    expect(res.body.data.failed).toBe(0);

    const statusOf = async (id: string) => (await Offering.findById(id).lean())?.status;
    expect(await statusOf(paid.id)).toBe("paid");
    expect(await statusOf(expired.id)).toBe("expired");
  });
});
