import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

const API = "/athos_adm/api";

let mongod: MongoMemoryServer;
let app: Express;
let devAdminToken: string;
let adminToken: string;
let memberToken: string;
let churchId: string;

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
    name: "Igreja Flags",
    logoUrl: "https://example.com/logo.png",
    slug: "igreja-flags",
    settings: { primaryColor: "#123456", youtubeChannelId: "UC123" },
  });
  churchId = String(church._id);
  const passwordHash = await hashPassword("senha123");

  const devAdmin = await User.create({ churchId, name: "Dev", email: "dev@flags.com", passwordHash, roles: ["devAdmin"] });
  const admin = await User.create({ churchId, name: "Admin", email: "admin@flags.com", passwordHash, roles: ["admin"] });
  const member = await User.create({ churchId, name: "Membro", email: "m@flags.com", passwordHash, roles: ["member"] });

  devAdminToken = signAccessToken({ sub: String(devAdmin._id), churchId, roles: ["devAdmin"] });
  adminToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  memberToken = signAccessToken({ sub: String(member._id), churchId, roles: ["member"] });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const patchFeatures = (token: string, body: Record<string, unknown>) =>
  request(app).patch(`${API}/churches/me/features`).set("Authorization", `Bearer ${token}`).send(body);

describe("Feature flags por igreja", () => {
  it("retorna os padrões: rádio desligada, demais ligados", async () => {
    const res = await request(app).get(`${API}/churches/me/features`).set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ radio: false, ads: true, aiAssistant: true, onlineOfferings: true });
  });

  it("aplica os padrões também a igrejas antigas, sem o campo gravado", async () => {
    const { Church } = await import("../models/Church.model");
    await Church.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(churchId) },
      { $unset: { "settings.features": "" } },
    );
    const res = await request(app).get(`${API}/churches/me/features`).set("Authorization", `Bearer ${memberToken}`);
    expect(res.body.data).toEqual({ radio: false, ads: true, aiAssistant: true, onlineOfferings: true });
  });

  it("expõe as flags no DTO da igreja", async () => {
    const res = await request(app).get(`${API}/churches/me`).set("Authorization", `Bearer ${memberToken}`);
    expect(res.body.data.settings.features).toEqual({ radio: false, ads: true, aiAssistant: true, onlineOfferings: true });
  });

  it("só o admin altera recursos", async () => {
    const res = await patchFeatures(memberToken, { aiAssistant: false });
    expect(res.status).toBe(403);
  });

  it("exige ao menos um recurso no corpo", async () => {
    const res = await patchFeatures(adminToken, {});
    expect(res.status).toBe(400);
  });

  it("bloqueia o assistente de IA quando desligado", async () => {
    const off = await patchFeatures(adminToken, { aiAssistant: false });
    expect(off.status).toBe(200);
    expect(off.body.data.aiAssistant).toBe(false);

    const res = await request(app)
      .post(`${API}/ai-chat/messages`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ message: "Olá" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FEATURE_DISABLED");

    await patchFeatures(adminToken, { aiAssistant: true });
  });

  it("bloqueia ofertas on-line quando desligadas", async () => {
    await patchFeatures(adminToken, { onlineOfferings: false });
    const res = await request(app)
      .post(`${API}/offerings`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ type: "donation", amount: 10, provider: "mercadopago" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FEATURE_DISABLED");
    await patchFeatures(adminToken, { onlineOfferings: true });
  });

  it("'ads' continua sincronizado com settings.adsEnabled", async () => {
    await patchFeatures(adminToken, { ads: false });
    const res = await request(app).get(`${API}/ads/settings`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.data.adsEnabled).toBe(false);

    await request(app).patch(`${API}/ads/settings`).set("Authorization", `Bearer ${adminToken}`).send({ adsEnabled: true });
    const features = await request(app).get(`${API}/churches/me/features`).set("Authorization", `Bearer ${adminToken}`);
    expect(features.body.data.ads).toBe(true);
  });

  it("não liga a rádio sem o aceite do termo de responsabilidade", async () => {
    const res = await patchFeatures(adminToken, { radio: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("FEATURE_REQUIRES_ACCEPTANCE");
  });

  it("liga a rádio após o aceite do admin", async () => {
    const published = await request(app)
      .post(`${API}/legal/documents`)
      .set("Authorization", `Bearer ${devAdminToken}`)
      .send({ type: "radio_liability", title: "Responsabilidade da rádio", content: "{{churchName}} responde pelo ECAD." });
    const { version, contentHash } = published.body.data;

    const accepted = await request(app)
      .post(`${API}/legal/radio_liability/accept`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ version, contentHash });
    expect(accepted.status).toBe(201);

    const res = await patchFeatures(adminToken, { radio: true });
    expect(res.status).toBe(200);
    expect(res.body.data.radio).toBe(true);
  });

  it("atualizar outras configurações não apaga flags nem o canal do YouTube", async () => {
    const res = await request(app)
      .patch(`${API}/churches/me`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ settings: { primaryColor: "#abcdef" } });
    expect(res.status).toBe(200);
    expect(res.body.data.settings.primaryColor).toBe("#abcdef");
    expect(res.body.data.settings.features.radio).toBe(true);

    await request(app).patch(`${API}/ads/settings`).set("Authorization", `Bearer ${adminToken}`).send({ adsEnabled: false });

    const { Church } = await import("../models/Church.model");
    const church = await Church.findById(churchId).lean();
    expect(church?.settings?.youtubeChannelId).toBe("UC123");
    expect(church?.settings?.features?.radio).toBe(true);
  });
});
