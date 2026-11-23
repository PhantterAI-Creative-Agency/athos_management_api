import crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

const API = "/athos_adm/api";

let mongod: MongoMemoryServer;
let app: Express;
let adminToken: string;
let memberToken: string;
let otherAdminToken: string;
let churchId: string;

type FetchCall = { url: string; body: Record<string, string> };
const calls: FetchCall[] = [];

function mockMercadoPago(responses: { status: number; body: Record<string, unknown> }[]) {
  const queue = [...responses];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    const next = queue.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
  });
}

const tokenResponse = (suffix: string) => ({
  status: 200,
  body: {
    access_token: `APP_USR-access-${suffix}`,
    token_type: "bearer",
    expires_in: 15552000,
    scope: "offline_access read write",
    user_id: 987654321,
    refresh_token: `TG-refresh-${suffix}`,
    public_key: `APP_USR-public-${suffix}`,
    live_mode: true,
  },
});

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

  const church = await Church.create({ name: "Igreja MP", logoUrl: "x", slug: "igreja-mp" });
  const other = await Church.create({ name: "Outra", logoUrl: "x", slug: "outra-mp" });
  churchId = String(church._id);
  const passwordHash = await hashPassword("senha123");
  const admin = await User.create({ churchId, name: "Admin", email: "a@mp.com", passwordHash, roles: ["admin"] });
  const member = await User.create({ churchId, name: "M", email: "m@mp.com", passwordHash, roles: ["member"] });
  const otherAdmin = await User.create({ churchId: other._id, name: "O", email: "o@mp.com", passwordHash, roles: ["admin"] });
  adminToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  memberToken = signAccessToken({ sub: String(member._id), churchId, roles: ["member"] });
  otherAdminToken = signAccessToken({ sub: String(otherAdmin._id), churchId: String(other._id), roles: ["admin"] });
});

afterEach(() => {
  vi.restoreAllMocks();
  calls.length = 0;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function startConnect() {
  const res = await request(app).get(`${API}/payments/mercadopago/connect`).set(auth(adminToken));
  expect(res.status).toBe(200);
  const url = new URL(res.body.data.authorizationUrl);
  return { url, state: url.searchParams.get("state")!, challenge: url.searchParams.get("code_challenge")! };
}

describe("Início da conexão", () => {
  it("só o admin conecta", async () => {
    const res = await request(app).get(`${API}/payments/mercadopago/connect`).set(auth(memberToken));
    expect(res.status).toBe(403);
  });

  it("monta a URL de autorização com state único e PKCE S256", async () => {
    const { url, state, challenge } = await startConnect();
    expect(url.origin + url.pathname).toBe("https://auth.mercadopago.com/authorization");
    expect(url.searchParams.get("client_id")).toBe("1234567890");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("platform_id")).toBe("mp");
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.MP_REDIRECT_URI);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(state.length).toBeGreaterThan(20);
    expect(challenge.length).toBeGreaterThan(20);

    const second = await startConnect();
    expect(second.state).not.toBe(state);
  });

  it("informa quando a plataforma ainda não configurou o Mercado Pago", async () => {
    const saved = process.env.MP_CLIENT_ID;
    delete process.env.MP_CLIENT_ID;
    try {
      const res = await request(app).get(`${API}/payments/mercadopago/connect`).set(auth(adminToken));
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("MERCADOPAGO_NOT_CONFIGURED");
    } finally {
      process.env.MP_CLIENT_ID = saved;
    }
  });
});

describe("Retorno do Mercado Pago (callback)", () => {
  it("recusa state desconhecido", async () => {
    const res = await request(app).get(`${API}/payments/mercadopago/callback?code=abc&state=inventado`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://site.exemplo.org/admin_athos?mercadopago=error&reason=invalid_state");
  });

  it("volta ao painel com erro quando o admin recusa a autorização", async () => {
    const { state } = await startConnect();
    const res = await request(app).get(`${API}/payments/mercadopago/callback?error=access_denied&state=${state}`);
    expect(res.headers.location).toBe(
      "https://site.exemplo.org/admin_athos/igreja-mp/ofertas?mercadopago=error&reason=access_denied",
    );
  });

  it("falha na troca do código não grava conta", async () => {
    const { state } = await startConnect();
    mockMercadoPago([{ status: 400, body: { error: "invalid_grant", message: "invalid code" } }]);
    const res = await request(app).get(`${API}/payments/mercadopago/callback?code=ruim&state=${state}`);
    expect(res.headers.location).toContain("reason=token_exchange_failed");
    const status = await request(app).get(`${API}/payments/mercadopago/status`).set(auth(adminToken));
    expect(status.body.data.connected).toBe(false);
  });

  it("troca o código (com code_verifier) e grava os tokens criptografados", async () => {
    const { state, challenge } = await startConnect();
    mockMercadoPago([tokenResponse("v1")]);

    const res = await request(app).get(`${API}/payments/mercadopago/callback?code=TG-code-123&state=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://site.exemplo.org/admin_athos/igreja-mp/ofertas?mercadopago=connected");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.mercadopago.com/oauth/token");
    expect(calls[0].body).toMatchObject({
      client_id: "1234567890",
      client_secret: "test-mp-client-secret",
      grant_type: "authorization_code",
      code: "TG-code-123",
      redirect_uri: process.env.MP_REDIRECT_URI,
    });
    const verifier = calls[0].body.code_verifier;
    expect(crypto.createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);

    const { PaymentAccount } = await import("../models/PaymentAccount.model");
    const raw = await PaymentAccount.collection.findOne({ churchId: new mongoose.Types.ObjectId(churchId) });
    expect(JSON.stringify(raw)).not.toContain("APP_USR-access-v1");
    expect(JSON.stringify(raw)).not.toContain("TG-refresh-v1");

    const { getChurchAccessToken } = await import("../services/mercadopagoAccount.service");
    expect(await getChurchAccessToken(churchId)).toBe("APP_USR-access-v1");
  });

  it("o mesmo state não pode ser usado duas vezes", async () => {
    const { state } = await startConnect();
    mockMercadoPago([tokenResponse("v2"), tokenResponse("v3")]);
    await request(app).get(`${API}/payments/mercadopago/callback?code=c1&state=${state}`);
    const again = await request(app).get(`${API}/payments/mercadopago/callback?code=c2&state=${state}`);
    expect(again.headers.location).toContain("reason=invalid_state");
    expect(calls).toHaveLength(1);
  });

  it("state vencido é recusado", async () => {
    const { state } = await startConnect();
    const { OAuthState } = await import("../models/OAuthState.model");
    await OAuthState.updateOne({ state }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app).get(`${API}/payments/mercadopago/callback?code=c&state=${state}`);
    expect(res.headers.location).toContain("reason=invalid_state");
  });
});

describe("Status", () => {
  it("mostra a conexão sem expor tokens", async () => {
    const res = await request(app).get(`${API}/payments/mercadopago/status`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ available: true, connected: true, status: "connected", mpUserId: "987654321", liveMode: true });
    const days = (new Date(res.body.data.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(180);
    expect(JSON.stringify(res.body)).not.toMatch(/APP_USR-access|TG-refresh/);
  });

  it("cada igreja vê só a própria conexão", async () => {
    const res = await request(app).get(`${API}/payments/mercadopago/status`).set(auth(otherAdminToken));
    expect(res.body.data.connected).toBe(false);
  });

  it("membro não vê o status", async () => {
    const res = await request(app).get(`${API}/payments/mercadopago/status`).set(auth(memberToken));
    expect(res.status).toBe(403);
  });
});

describe("Renovação dos tokens", () => {
  const cron = () => request(app).post(`${API}/internal/cron/mercadopago-refresh-tokens`);

  it("a rota de cron exige o segredo", async () => {
    expect((await cron()).status).toBe(401);
    expect((await cron().set("Authorization", "Bearer errado")).status).toBe(401);
  });

  it("não renova token longe do vencimento", async () => {
    mockMercadoPago([]);
    const res = await cron().set("Authorization", "Bearer test-cron-secret");
    expect(res.body.data).toEqual({ checked: 0, refreshed: 0, failed: 0 });
    expect(calls).toHaveLength(0);
  });

  it("renova token perto do vencimento e guarda o novo refresh token", async () => {
    const { PaymentAccount } = await import("../models/PaymentAccount.model");
    await PaymentAccount.updateOne({ churchId }, { $set: { expiresAt: new Date(Date.now() + 10 * 86_400_000) } });
    mockMercadoPago([tokenResponse("renovado")]);

    const res = await cron().set("Authorization", "Bearer test-cron-secret");
    expect(res.body.data).toEqual({ checked: 1, refreshed: 1, failed: 0 });
    expect(calls[0].body).toMatchObject({ grant_type: "refresh_token", refresh_token: "TG-refresh-v2" });

    const { getChurchAccessToken } = await import("../services/mercadopagoAccount.service");
    expect(await getChurchAccessToken(churchId)).toBe("APP_USR-access-renovado");
    const account = await PaymentAccount.findOne({ churchId }).select("+refreshTokenEnc");
    const { decryptSecret } = await import("../helpers/crypto.helper");
    expect(decryptSecret(account!.refreshTokenEnc!)).toBe("TG-refresh-renovado");
  });

  it("autorização revogada no Mercado Pago pede nova conexão", async () => {
    const { PaymentAccount } = await import("../models/PaymentAccount.model");
    await PaymentAccount.updateOne({ churchId }, { $set: { expiresAt: new Date(Date.now() + 5 * 86_400_000) } });
    mockMercadoPago([{ status: 400, body: { error: "invalid_grant", message: "revoked" } }]);

    const res = await cron().set("Authorization", "Bearer test-cron-secret");
    expect(res.body.data).toEqual({ checked: 1, refreshed: 0, failed: 1 });

    const status = await request(app).get(`${API}/payments/mercadopago/status`).set(auth(adminToken));
    expect(status.body.data).toMatchObject({ connected: false, status: "needs_reconnect" });

    const { getChurchAccessToken } = await import("../services/mercadopagoAccount.service");
    expect(await getChurchAccessToken(churchId)).toBeNull();
  });
});

describe("Desconexão", () => {
  it("apaga os tokens e marca como desconectada", async () => {
    const res = await request(app).delete(`${API}/payments/mercadopago`).set(auth(adminToken));
    expect(res.status).toBe(204);

    const status = await request(app).get(`${API}/payments/mercadopago/status`).set(auth(adminToken));
    expect(status.body.data).toMatchObject({ connected: false, status: "not_connected" });

    const { PaymentAccount } = await import("../models/PaymentAccount.model");
    const raw = await PaymentAccount.collection.findOne({ churchId: new mongoose.Types.ObjectId(churchId) });
    expect(raw?.accessTokenEnc).toBeUndefined();
    expect(raw?.refreshTokenEnc).toBeUndefined();

    const again = await request(app).delete(`${API}/payments/mercadopago`).set(auth(adminToken));
    expect(again.status).toBe(404);
  });

  it("reconectar depois funciona", async () => {
    const { state } = await startConnect();
    mockMercadoPago([tokenResponse("novo")]);
    const res = await request(app).get(`${API}/payments/mercadopago/callback?code=c&state=${state}`);
    expect(res.headers.location).toContain("mercadopago=connected");
    const status = await request(app).get(`${API}/payments/mercadopago/status`).set(auth(adminToken));
    expect(status.body.data.connected).toBe(true);
  });
});
