import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

const API = "/athos_adm/api";
const PLATFORM_TOKEN = "APP_USR-phantterai-platform";

let mongod: MongoMemoryServer;
let app: Express;
let adminToken: string;
let devToken: string;
let churchId: string;
let cardChurchToken: string;
let cardChurchId: string;

// Mercado Pago simulado (conta da PhantterAI): pagamentos PIX, assinaturas e cobranças do cartão.
type FakePayment = Record<string, unknown> & { id: number; status: string; transaction_amount: number; external_reference: string };
const payments = new Map<string, FakePayment>();
const preapprovals = new Map<string, Record<string, unknown>>();
const authorized = new Map<string, Record<string, unknown>>();
const calls: { method: string; path: string; body?: Record<string, unknown>; headers: Record<string, string> }[] = [];
let seq = 5000;

function installFakeMercadoPago() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method, path: url.pathname, body, headers });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (headers.Authorization !== `Bearer ${PLATFORM_TOKEN}`) return json(401, { message: "unauthorized" });

    if (method === "POST" && url.pathname === "/v1/payments") {
      const id = seq++;
      const p: FakePayment = {
        id,
        status: "pending",
        transaction_amount: body.transaction_amount,
        external_reference: body.external_reference,
        point_of_interaction: { transaction_data: { qr_code: `pix-${id}`, qr_code_base64: "iVBORw0KGgo=", ticket_url: `https://mp.test/pix/${id}` } },
      };
      payments.set(String(id), p);
      return json(201, p);
    }
    let m = /^\/v1\/payments\/(\d+)$/.exec(url.pathname);
    if (m && method === "PUT") {
      payments.get(m[1])!.status = body.status;
      return json(200, payments.get(m[1]));
    }
    if (m) return json(200, payments.get(m[1]));

    if (method === "POST" && url.pathname === "/preapproval") {
      const id = `pre_${seq++}`;
      preapprovals.set(id, { id, status: "pending", init_point: `https://mp.test/subscriptions/${id}`, ...body });
      return json(201, preapprovals.get(id));
    }
    m = /^\/preapproval\/([^/]+)$/.exec(url.pathname);
    if (m && method === "PUT") {
      const p = preapprovals.get(m[1])!;
      if (body.status) p.status = body.status;
      if (body.auto_recurring) p.auto_recurring = { ...(p.auto_recurring as object), ...body.auto_recurring };
      return json(200, p);
    }
    if (m) return json(200, preapprovals.get(m[1]));
    m = /^\/authorized_payments\/([^/]+)$/.exec(url.pathname);
    if (m) return json(200, authorized.get(m[1]));
    return json(404, {});
  });
}

const notify = (type: string, id: string | number) =>
  request(app).post(`${API}/billing/mercadopago/webhook?data.id=${id}&type=${type}`).send({ type, data: { id } });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MP_PLATFORM_ACCESS_TOKEN = PLATFORM_TOKEN;

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

  const createChurch = async (name: string, email: string) => {
    const created = await request(app)
      .post(`${API}/platform/churches`)
      .set("Authorization", `Bearer ${devToken}`)
      .send({ name, admin: { name: "Pr. Admin", email } });
    const admin = await User.findById(created.body.data.adminId);
    const id = created.body.data.church.id as string;
    return { id, token: signAccessToken({ sub: String(admin!._id), churchId: id, roles: ["admin"] }) };
  };
  ({ id: churchId, token: adminToken } = await createChurch("Igreja Nova Aliança", "paulo@alianca.org"));
  ({ id: cardChurchId, token: cardChurchToken } = await createChurch("Igreja do Cartão", "ana@cartao.org"));
});

beforeEach(() => installFakeMercadoPago());
afterEach(() => {
  vi.restoreAllMocks();
  calls.length = 0;
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const overview = async (token = adminToken) => (await request(app).get(`${API}/billing/me`).set(auth(token))).body.data;
async function acceptContract(token: string) {
  const terms = (await request(app).get(`${API}/legal/saas_contract/current`)).body.data;
  await request(app)
    .post(`${API}/legal/saas_contract/accept`)
    .set(auth(token))
    .send({ ...terms, signer: { name: "Representante", cpf: "529.982.247-25", role: "Pastor", cnpj: "11.222.333/0001-81" } })
    .expect(201);
}

describe("Igreja nova: teste no plano Essencial", () => {
  it("começa em teste de 30 dias, sem recursos do Completo", async () => {
    const data = await overview();
    expect(data.state).toMatchObject({ plan: "essencial", status: "trial", access: "full", exempt: false });
    expect(Math.round((new Date(data.trialEndsAt).getTime() - Date.now()) / 86_400_000)).toBe(30);
    expect(data.billingConfigured).toBe(true);
    const features = await request(app).get(`${API}/churches/me/features`).set(auth(adminToken));
    expect(features.body.data).toMatchObject({ aiAssistant: false, ads: false, radio: false, onlineOfferings: true });
  });

  it("recursos do Completo pedem troca de plano", async () => {
    const res = await request(app).patch(`${API}/churches/me/features`).set(auth(adminToken)).send({ aiAssistant: true });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("PLAN_UPGRADE_REQUIRED");
  });

  it("a igreja-piloto (sem assinatura) segue Completo e isenta", async () => {
    const { getBillingState } = await import("../helpers/plans.helper");
    const { Church } = await import("../models/Church.model");
    const pilot = await Church.findOne({ slug: "piloto-billing" }).lean();
    expect(getBillingState(pilot?.subscription)).toMatchObject({ plan: "completo", exempt: true });
  });
});

describe("Mensalidade por PIX (Mercado Pago da PhantterAI)", () => {
  it("exige o contrato aceito", async () => {
    const res = await request(app).post(`${API}/billing/subscribe`).set(auth(adminToken)).send({ plan: "essencial", paymentMethod: "pix" });
    expect(res.body.error.code).toBe("CONTRACT_REQUIRED");
  });

  it("contrata no teste: nenhuma fatura antes de faltar 5 dias para o vencimento", async () => {
    await acceptContract(adminToken);
    const res = await request(app).post(`${API}/billing/subscribe`).set(auth(adminToken)).send({ plan: "essencial", paymentMethod: "pix" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ subscribed: true, paymentMethod: "pix", invoices: [] });
    expect(res.body.data.nextDueDate).toBe(res.body.data.trialEndsAt);
  });

  it("o ciclo diário gera a fatura PIX na conta da PhantterAI perto do vencimento", async () => {
    const { Church } = await import("../models/Church.model");
    const due = new Date(Date.now() + 3 * 86_400_000);
    await Church.updateOne({ _id: churchId }, { $set: { "subscription.nextDueDate": due, "subscription.trialEndsAt": due } });

    const cron = await request(app).post(`${API}/internal/cron/billing-cycle`).set("Authorization", "Bearer test-cron-secret");
    expect(cron.body.data.invoices).toBe(1);

    const create = calls.find((c) => c.method === "POST" && c.path === "/v1/payments")!;
    expect(create.headers.Authorization).toBe(`Bearer ${PLATFORM_TOKEN}`);
    expect(create.body).toMatchObject({
      transaction_amount: 97,
      payment_method_id: "pix",
      payer: { email: "paulo@alianca.org", identification: { type: "CNPJ", number: "11222333000181" } },
      notification_url: "https://api.exemplo.org/athos_adm/api/billing/mercadopago/webhook",
    });

    const data = await overview();
    expect(data.invoices[0]).toMatchObject({ kind: "monthly", method: "pix", value: 97, status: "pending" });
    expect(data.invoices[0].pixCopyPaste).toMatch(/^pix-/);
    expect(data.invoices[0].invoiceUrl).toMatch(/^https:\/\/mp\.test\/pix\//);

    const again = await request(app).post(`${API}/internal/cron/billing-cycle`).set("Authorization", "Bearer test-cron-secret");
    expect(again.body.data.invoices).toBe(0);
  });

  it("não confia na notificação: confere na API; pago ativa a assinatura", async () => {
    const data = await overview();
    const invoice = data.invoices[0];
    const { BillingInvoice } = await import("../models/BillingInvoice.model");
    const stored = await BillingInvoice.findById(invoice.id).lean();

    await notify("payment", stored!.providerPaymentId).expect(200);
    expect((await overview()).state.status).toBe("trial");

    payments.get(stored!.providerPaymentId)!.status = "approved";
    await notify("payment", stored!.providerPaymentId).expect(200);
    const after = await overview();
    expect(after.state).toMatchObject({ status: "active", access: "full" });
    expect(after.invoices[0]).toMatchObject({ status: "paid" });
    expect(after.invoices[0].pixCopyPaste).toBeUndefined();
    expect(new Date(after.nextDueDate).getTime()).toBeGreaterThan(Date.now() + 25 * 86_400_000);
  });

  it("fatura vencida sem pagamento: carência e depois somente leitura; pagar libera", async () => {
    const { Church } = await import("../models/Church.model");
    const due = new Date(Date.now() - 20 * 86_400_000);
    await Church.updateOne({ _id: churchId }, { $set: { "subscription.nextDueDate": due } });
    await request(app).post(`${API}/internal/cron/billing-cycle`).set("Authorization", "Bearer test-cron-secret").expect(200);

    const data = await overview();
    expect(data.state).toMatchObject({ status: "past_due", access: "read_only" });

    const write = await request(app).put(`${API}/churches/me/pix`).set(auth(adminToken)).send({ keyType: "email", key: "a@b.com", receiverName: "Igreja", city: "Recife" });
    expect(write.status).toBe(402);
    expect(write.body.error.code).toBe("SUBSCRIPTION_READ_ONLY");

    const pay = await request(app).post(`${API}/billing/pay`).set(auth(adminToken));
    expect(pay.status).toBe(200);
    expect(pay.body.data.pixCopyPaste).toMatch(/^pix-/);

    const { BillingInvoice } = await import("../models/BillingInvoice.model");
    const open = await BillingInvoice.findById(pay.body.data.id).lean();
    payments.get(open!.providerPaymentId)!.status = "approved";
    await notify("payment", open!.providerPaymentId).expect(200);
    expect((await overview()).state).toMatchObject({ status: "active", access: "full" });
  });

  it("troca de plano refaz a fatura em aberto com o novo valor", async () => {
    const { Church } = await import("../models/Church.model");
    await Church.updateOne({ _id: churchId }, { $set: { "subscription.nextDueDate": new Date(Date.now() + 2 * 86_400_000) } });
    await request(app).post(`${API}/internal/cron/billing-cycle`).set("Authorization", "Bearer test-cron-secret");
    calls.length = 0;

    const res = await request(app).post(`${API}/billing/change-plan`).set(auth(adminToken)).send({ plan: "completo" });
    expect(res.body.data.state.plan).toBe("completo");
    expect(calls.some((c) => c.method === "PUT" && c.body?.status === "cancelled")).toBe(true);
    expect(calls.find((c) => c.method === "POST" && c.path === "/v1/payments")!.body).toMatchObject({ transaction_amount: 197 });
    expect((await request(app).patch(`${API}/churches/me/features`).set(auth(adminToken)).send({ aiAssistant: true })).status).toBe(200);
  });

  it("cancelar para as cobranças e mantém o acesso até o fim do período pago", async () => {
    const res = await request(app).post(`${API}/billing/cancel`).set(auth(adminToken));
    expect(res.body.data).toMatchObject({ subscribed: false });
    expect(res.body.data.state).toMatchObject({ status: "canceled", access: "full", warning: "canceled" });
  });
});

describe("Mensalidade no cartão (Mercado Pago Assinaturas)", () => {
  it("cria a assinatura com 1ª cobrança no fim do teste e devolve o link para informar o cartão", async () => {
    await acceptContract(cardChurchToken);
    const res = await request(app).post(`${API}/billing/subscribe`).set(auth(cardChurchToken)).send({ plan: "completo", paymentMethod: "card" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ subscribed: true, paymentMethod: "card" });
    expect(res.body.data.cardCheckoutUrl).toMatch(/^https:\/\/mp\.test\/subscriptions\//);

    const create = calls.find((c) => c.method === "POST" && c.path === "/preapproval")!;
    expect(create.headers.Authorization).toBe(`Bearer ${PLATFORM_TOKEN}`);
    expect(create.body).toMatchObject({
      payer_email: "ana@cartao.org",
      status: "pending",
      external_reference: `church:${cardChurchId}`,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 197, currency_id: "BRL" },
    });
    expect(String(create.body!.auto_recurring && (create.body!.auto_recurring as { start_date: string }).start_date).slice(0, 10)).toBe(
      res.body.data.trialEndsAt.slice(0, 10),
    );
  });

  it("assinatura autorizada e cobrança aprovada ativam; cobrança recusada abre a carência", async () => {
    const { Church } = await import("../models/Church.model");
    const preId = (await Church.findById(cardChurchId).lean())!.subscription!.mpPreapprovalId!;
    preapprovals.get(preId)!.status = "authorized";
    await notify("subscription_preapproval", preId).expect(200);
    expect((await overview(cardChurchToken)).cardCheckoutUrl).toBeUndefined();

    authorized.set("777", { id: 777, preapproval_id: preId, status: "processed", transaction_amount: 197, debit_date: new Date().toISOString(), payment: { id: 9001, status: "approved" } });
    await notify("subscription_authorized_payment", "777").expect(200);
    let data = await overview(cardChurchToken);
    expect(data.state.status).toBe("active");
    expect(data.invoices[0]).toMatchObject({ method: "card", value: 197, status: "paid" });

    authorized.set("778", { id: 778, preapproval_id: preId, status: "recycling", transaction_amount: 197, debit_date: new Date().toISOString(), payment: { id: 9002, status: "rejected" } });
    await notify("subscription_authorized_payment", "778").expect(200);
    data = await overview(cardChurchToken);
    expect(data.state).toMatchObject({ status: "past_due", access: "full", warning: "past_due" });
  });

  it("troca de plano altera o valor da assinatura; cancelar usa status canceled", async () => {
    const res = await request(app).post(`${API}/billing/change-plan`).set(auth(cardChurchToken)).send({ plan: "essencial" });
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.method === "PUT" && c.path.startsWith("/preapproval/"))!.body).toMatchObject({ auto_recurring: { transaction_amount: 97 } });

    calls.length = 0;
    await request(app).post(`${API}/billing/cancel`).set(auth(cardChurchToken)).expect(200);
    expect(calls.find((c) => c.method === "PUT" && c.path.startsWith("/preapproval/"))!.body).toEqual({ status: "canceled" });
  });
});

describe("Plataforma", () => {
  it("isenta a igreja e lança a taxa de implantação por PIX", async () => {
    let res = await request(app).patch(`${API}/platform/churches/${churchId}/billing`).set(auth(devToken)).send({ exempt: true });
    expect(res.body.data.state).toMatchObject({ exempt: true, access: "full" });

    res = await request(app).post(`${API}/platform/churches/${churchId}/setup-fee`).set(auth(devToken)).send({ value: 400 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ kind: "setup", method: "pix", value: 400, status: "pending" });
    expect(calls.find((c) => c.path === "/v1/payments")!.body).toMatchObject({ transaction_amount: 400 });
  });

  it("admin da igreja não mexe na cobrança da plataforma", async () => {
    expect((await request(app).patch(`${API}/platform/churches/${churchId}/billing`).set(auth(adminToken)).send({ exempt: true })).status).toBe(403);
  });
});
