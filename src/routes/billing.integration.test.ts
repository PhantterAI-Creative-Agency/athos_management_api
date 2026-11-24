import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

const API = "/athos_adm/api";
const WEBHOOK_TOKEN = "token-do-webhook-asaas-com-32-caracteres!";

let mongod: MongoMemoryServer;
let app: Express;
let adminToken: string;
let devToken: string;
let churchId: string;

// Asaas simulado.
type FakePayment = { id: string; customer: string; subscription?: string; value: number; status: string; dueDate: string; externalReference?: string; deleted?: boolean; invoiceUrl: string; paymentDate?: string };
const customers: Record<string, unknown>[] = [];
const subscriptions = new Map<string, Record<string, unknown>>();
const payments = new Map<string, FakePayment>();
const calls: { method: string; path: string; body?: Record<string, unknown>; headers: Record<string, string> }[] = [];
let seq = 1;

function installFakeAsaas() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v3/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method, path, body, headers });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (headers.access_token !== "chave-asaas-teste") return json(401, { errors: [{ description: "unauthorized" }] });

    if (method === "POST" && path === "/customers") {
      const c = { id: `cus_${seq++}`, ...body };
      customers.push(c);
      return json(200, c);
    }
    if (method === "POST" && path === "/subscriptions") {
      const id = `sub_${seq++}`;
      subscriptions.set(id, { id, ...body, status: "ACTIVE" });
      const pay: FakePayment = { id: `pay_${seq++}`, customer: body.customer, subscription: id, value: body.value, status: "PENDING", dueDate: body.nextDueDate, externalReference: body.externalReference, invoiceUrl: `https://asaas.test/i/${seq}` };
      payments.set(pay.id, pay);
      return json(200, { id, status: "ACTIVE", nextDueDate: body.nextDueDate });
    }
    let m = /^\/subscriptions\/([^/]+)\/payments$/.exec(path);
    if (m) return json(200, { data: [...payments.values()].filter((p) => p.subscription === m![1] && !p.deleted) });
    m = /^\/subscriptions\/([^/]+)$/.exec(path);
    if (m && method === "DELETE") {
      subscriptions.get(m[1])!.status = "DELETED";
      for (const p of payments.values()) if (p.subscription === m[1] && p.status !== "RECEIVED") p.deleted = true;
      return json(200, { deleted: true, id: m[1] });
    }
    if (method === "POST" && path === "/payments") {
      const pay: FakePayment = { id: `pay_${seq++}`, customer: body.customer, value: body.value, status: "PENDING", dueDate: body.dueDate, externalReference: body.externalReference, invoiceUrl: `https://asaas.test/i/${seq}` };
      payments.set(pay.id, pay);
      return json(200, pay);
    }
    m = /^\/payments\/([^/]+)$/.exec(path);
    if (m) return payments.get(m[1]) ? json(200, payments.get(m[1])) : json(404, { errors: [{ description: "not found" }] });
    return json(404, {});
  });
}

const webhook = (event: string, paymentId: string, id = `evt_${seq++}`, extra: Record<string, unknown> = {}) =>
  request(app)
    .post(`${API}/billing/asaas/webhook`)
    .set("asaas-access-token", WEBHOOK_TOKEN)
    .send({ id, event, payment: { id: paymentId, ...extra } });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.ASAAS_API_KEY = "chave-asaas-teste";
  process.env.ASAAS_WEBHOOK_TOKEN = WEBHOOK_TOKEN;

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { hashPassword } = await import("../helpers/password.helper");
  const { signAccessToken } = await import("../helpers/jwt.helper");
  const { syncDocuments } = await import("../services/legal.service");

  await connectDB(process.env.MONGODB_URI);
  app = createApp();

  const pilot = await Church.create({ name: "Piloto", logoUrl: "x", slug: "piloto-billing" });
  const passwordHash = await hashPassword("senha123");
  const dev = await User.create({ churchId: pilot._id, name: "Dev", email: "dev@b.com", passwordHash, roles: ["devAdmin"] });
  devToken = signAccessToken({ sub: String(dev._id), churchId: String(pilot._id), roles: ["devAdmin"] });

  await syncDocuments([{ type: "saas_contract", title: "Contrato", content: "Contrato\n" }]);

  const created = await request(app)
    .post(`${API}/platform/churches`)
    .set("Authorization", `Bearer ${devToken}`)
    .send({ name: "Igreja Nova Aliança", admin: { name: "Pr. Paulo", email: "paulo@alianca.org" } });
  churchId = created.body.data.church.id;
  const admin = await User.findById(created.body.data.adminId);
  adminToken = signAccessToken({ sub: String(admin!._id), churchId, roles: ["admin"] });
});

beforeEach(() => installFakeAsaas());
afterEach(() => {
  vi.restoreAllMocks();
  calls.length = 0;
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const overview = async () => (await request(app).get(`${API}/billing/me`).set(auth(adminToken))).body.data;

describe("Igreja nova: teste no plano Essencial", () => {
  it("começa em teste de 30 dias, sem recursos do Completo", async () => {
    const data = await overview();
    expect(data.state).toMatchObject({ plan: "essencial", status: "trial", access: "full", exempt: false });
    expect(Math.round((new Date(data.trialEndsAt).getTime() - Date.now()) / 86_400_000)).toBe(30);
    expect(data.plans.map((p: { id: string; price: number }) => [p.id, p.price])).toEqual([["essencial", 97], ["completo", 197]]);

    const features = await request(app).get(`${API}/churches/me/features`).set(auth(adminToken));
    expect(features.body.data).toMatchObject({ aiAssistant: false, ads: false, radio: false, onlineOfferings: true });
  });

  it("recursos do Completo pedem troca de plano", async () => {
    const res = await request(app).patch(`${API}/churches/me/features`).set(auth(adminToken)).send({ aiAssistant: true });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("PLAN_UPGRADE_REQUIRED");
    const chat = await request(app).post(`${API}/ai-chat/messages`).set(auth(adminToken)).send({ message: "oi" });
    expect(chat.status).toBe(403);
  });

  it("a igreja-piloto (sem assinatura) segue Completo e isenta", async () => {
    const { getBillingState } = await import("../helpers/plans.helper");
    const { Church } = await import("../models/Church.model");
    const pilot = await Church.findOne({ slug: "piloto-billing" }).lean();
    expect(getBillingState(pilot?.subscription)).toMatchObject({ plan: "completo", exempt: true });
  });
});

describe("Assinatura no Asaas", () => {
  it("exige o contrato aceito com CNPJ", async () => {
    const res = await request(app).post(`${API}/billing/subscribe`).set(auth(adminToken)).send({ plan: "essencial" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONTRACT_REQUIRED");
  });

  it("assina: cliente com o CNPJ do contrato e 1ª cobrança no fim do teste", async () => {
    const terms = (await request(app).get(`${API}/legal/saas_contract/current`)).body.data;
    await request(app)
      .post(`${API}/legal/saas_contract/accept`)
      .set(auth(adminToken))
      .send({ ...terms, signer: { name: "Paulo Souza", cpf: "529.982.247-25", role: "Pastor", cnpj: "11.222.333/0001-81" } })
      .expect(201);

    const res = await request(app).post(`${API}/billing/subscribe`).set(auth(adminToken)).send({ plan: "essencial", billingType: "PIX" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ subscribed: true, billingType: "PIX", contractCnpj: "11222333000181" });
    expect(res.body.data.state.status).toBe("trial");
    expect(res.body.data.invoices).toHaveLength(1);
    expect(res.body.data.invoices[0]).toMatchObject({ kind: "monthly", value: 97, status: "pending" });

    const customer = calls.find((c) => c.path === "/customers")!;
    expect(customer.body).toMatchObject({ name: "Igreja Nova Aliança", cpfCnpj: "11222333000181", email: "paulo@alianca.org" });
    const sub = calls.find((c) => c.path === "/subscriptions" && c.method === "POST")!;
    expect(sub.body).toMatchObject({ value: 97, cycle: "MONTHLY", billingType: "PIX", externalReference: `church:${churchId}:monthly` });
    expect(sub.body!.nextDueDate).toBe(res.body.data.trialEndsAt.slice(0, 10));

    const again = await request(app).post(`${API}/billing/subscribe`).set(auth(adminToken)).send({ plan: "essencial" });
    expect(again.body.error.code).toBe("ALREADY_SUBSCRIBED");
  });
});

describe("Webhook do Asaas", () => {
  it("exige o token", async () => {
    const res = await request(app).post(`${API}/billing/asaas/webhook`).send({ event: "PAYMENT_RECEIVED", payment: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("não confia no corpo: confere o pagamento na API", async () => {
    const pay = [...payments.values()].find((p) => p.status === "PENDING")!;
    const res = await webhook("PAYMENT_RECEIVED", pay.id, undefined, { status: "RECEIVED" });
    expect(res.status).toBe(200);
    expect((await overview()).state.status).toBe("trial");
  });

  it("pagamento recebido ativa a assinatura; evento repetido é ignorado", async () => {
    const pay = [...payments.values()].find((p) => p.status === "PENDING")!;
    pay.status = "RECEIVED";
    pay.paymentDate = pay.dueDate;
    expect((await webhook("PAYMENT_RECEIVED", pay.id, "evt_fixo")).body.data.processed).toBe(true);
    expect((await webhook("PAYMENT_RECEIVED", pay.id, "evt_fixo")).body.data.processed).toBe(false);

    const data = await overview();
    expect(data.state).toMatchObject({ status: "active", access: "full" });
    expect(data.invoices[0]).toMatchObject({ status: "paid" });
    expect(new Date(data.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now() + 50 * 86_400_000);
  });
});

describe("Inadimplência", () => {
  it("vencida entra em carência e, depois dela, o painel fica somente leitura", async () => {
    const { Church } = await import("../models/Church.model");
    const church = await Church.findById(churchId).lean();
    const pay = { id: `pay_${seq++}`, customer: church!.subscription!.asaasCustomerId!, subscription: church!.subscription!.asaasSubscriptionId!, value: 97, status: "OVERDUE", dueDate: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), externalReference: `church:${churchId}:monthly`, invoiceUrl: "https://asaas.test/i/x" };
    payments.set(pay.id, pay);
    await webhook("PAYMENT_OVERDUE", pay.id).expect(200);

    let data = await overview();
    expect(data.state).toMatchObject({ status: "past_due", access: "full", warning: "past_due" });

    await Church.updateOne({ _id: churchId }, { $set: { "subscription.graceUntil": new Date(Date.now() - 1000) } });
    data = await overview();
    expect(data.state).toMatchObject({ access: "read_only" });

    const write = await request(app).put(`${API}/churches/me/pix`).set(auth(adminToken)).send({ keyType: "email", key: "a@b.com", receiverName: "Igreja", city: "Recife" });
    expect(write.status).toBe(402);
    expect(write.body.error.code).toBe("SUBSCRIPTION_READ_ONLY");
    expect((await request(app).get(`${API}/churches/me`).set(auth(adminToken))).status).toBe(200);

    const { sendBillingNotices } = await import("../services/billing.service");
    expect((await sendBillingNotices()).sent).toBe(1);
    expect((await sendBillingNotices()).sent).toBe(0);

    pay.status = "RECEIVED";
    await webhook("PAYMENT_RECEIVED", pay.id).expect(200);
    expect((await overview()).state).toMatchObject({ status: "active", access: "full" });
    expect((await request(app).put(`${API}/churches/me/pix`).set(auth(adminToken)).send({ keyType: "email", key: "a@b.com", receiverName: "Igreja", city: "Recife" })).status).toBe(200);
  });
});

describe("Troca de plano e cancelamento", () => {
  it("troca para o Completo: nova assinatura com o novo valor e libera os recursos", async () => {
    const { Church } = await import("../models/Church.model");
    const oldId = (await Church.findById(churchId).lean())!.subscription!.asaasSubscriptionId;
    const res = await request(app).post(`${API}/billing/change-plan`).set(auth(adminToken)).send({ plan: "completo" });
    expect(res.status).toBe(200);
    expect(res.body.data.state.plan).toBe("completo");
    expect(calls.find((c) => c.method === "POST" && c.path === "/subscriptions")!.body).toMatchObject({ value: 197 });
    expect(calls.some((c) => c.method === "DELETE" && c.path === `/subscriptions/${oldId}`)).toBe(true);

    const features = await request(app).patch(`${API}/churches/me/features`).set(auth(adminToken)).send({ aiAssistant: true });
    expect(features.status).toBe(200);
  });

  it("cancelar mantém o acesso até o fim do período pago", async () => {
    const res = await request(app).post(`${API}/billing/cancel`).set(auth(adminToken));
    expect(res.body.data.state).toMatchObject({ status: "canceled", access: "full", warning: "canceled" });
    expect(res.body.data.subscribed).toBe(false);
  });
});

describe("Plataforma", () => {
  it("isenta a igreja e lança a taxa de implantação", async () => {
    let res = await request(app).patch(`${API}/platform/churches/${churchId}/billing`).set(auth(devToken)).send({ exempt: true });
    expect(res.body.data.state).toMatchObject({ exempt: true, access: "full" });

    res = await request(app).post(`${API}/platform/churches/${churchId}/setup-fee`).set(auth(devToken)).send({ value: 400 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ kind: "setup", value: 400, status: "pending" });
    expect(calls.find((c) => c.path === "/payments")!.body).toMatchObject({ value: 400, externalReference: `church:${churchId}:setup` });

    const list = await request(app).get(`${API}/platform/churches`).set(auth(devToken));
    const row = list.body.data.find((c: { id: string }) => c.id === churchId);
    expect(row.billing).toMatchObject({ plan: "completo", exempt: true });
  });

  it("admin da igreja não mexe na cobrança da plataforma", async () => {
    expect((await request(app).patch(`${API}/platform/churches/${churchId}/billing`).set(auth(adminToken)).send({ exempt: true })).status).toBe(403);
  });
});
