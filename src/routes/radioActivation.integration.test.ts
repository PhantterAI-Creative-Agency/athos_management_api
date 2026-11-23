import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

const API = "/athos_adm/api";

let mongod: MongoMemoryServer;
let app: Express;
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
  const { syncDocuments } = await import("../services/legal.service");

  await connectDB(process.env.MONGODB_URI);
  app = createApp();

  const church = await Church.create({ name: "Igreja Rádio", logoUrl: "x", slug: "igreja-radio" });
  churchId = String(church._id);
  const passwordHash = await hashPassword("senha123");
  const admin = await User.create({ churchId, name: "Admin", email: "a@radio.com", passwordHash, roles: ["admin"] });
  const member = await User.create({ churchId, name: "M", email: "m@radio.com", passwordHash, roles: ["member"] });
  adminToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  memberToken = signAccessToken({ sub: String(member._id), churchId, roles: ["member"] });

  await syncDocuments([{ type: "radio_liability", title: "Termo da rádio", content: "ECAD v1\n" }]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const status = async () => (await request(app).get(`${API}/radio/status`).set(auth(adminToken))).body.data;
const currentTerms = async () => (await request(app).get(`${API}/legal/radio_liability/current`)).body.data;

describe("Rádio desativada por padrão", () => {
  it("começa desligada, com o termo vigente para aceitar", async () => {
    const data = await status();
    expect(data).toMatchObject({ enabled: false, termsAccepted: false, active: false });
    expect(data.terms).toMatchObject({ version: 1, title: "Termo da rádio" });
  });

  it("bloqueia a gestão da rádio e não transmite nada", async () => {
    const res = await request(app).get(`${API}/radio/tracks`).set(auth(adminToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("RADIO_INACTIVE");

    const pub = await request(app).get(`${API}/public/churches/igreja-radio/radio`);
    expect(pub.status).toBe(200);
    expect(pub.body.data).toEqual({ playlists: [], nextChangeAt: null });
  });

  it("flag ligada sem termo aceito (ativação provisória) não põe a rádio no ar", async () => {
    const { Church } = await import("../models/Church.model");
    await Church.updateOne({ _id: churchId }, { $set: { "settings.features.radio": true } });
    const data = await status();
    expect(data).toMatchObject({ enabled: true, termsAccepted: false, active: false });
    expect((await request(app).get(`${API}/radio/tracks`).set(auth(adminToken))).status).toBe(403);
    await Church.updateOne({ _id: churchId }, { $set: { "settings.features.radio": false } });
  });
});

describe("Ativação com aceite", () => {
  it("membro não ativa", async () => {
    const terms = await currentTerms();
    const res = await request(app).post(`${API}/radio/activate`).set(auth(memberToken)).send(terms);
    expect(res.status).toBe(403);
  });

  it("recusa termo desatualizado", async () => {
    const res = await request(app)
      .post(`${API}/radio/activate`)
      .set(auth(adminToken))
      .send({ version: 1, contentHash: "0".repeat(64) });
    expect(res.status).toBe(409);
  });

  it("aceita o termo com evidência e põe a rádio no ar", async () => {
    const terms = await currentTerms();
    const res = await request(app)
      .post(`${API}/radio/activate`)
      .set(auth(adminToken))
      .set("User-Agent", "painel-teste")
      .send({ version: terms.version, contentHash: terms.contentHash });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ enabled: true, termsAccepted: true, active: true, acceptedVersion: 1 });

    const { LegalAcceptance } = await import("../models/LegalAcceptance.model");
    const record = await LegalAcceptance.findOne({ churchId, documentType: "radio_liability" }).lean();
    expect(record?.userAgent).toBe("painel-teste");

    expect((await request(app).get(`${API}/radio/tracks`).set(auth(adminToken))).status).toBe(200);
  });

  it("desativar tira do ar mas mantém o histórico do aceite", async () => {
    const res = await request(app).post(`${API}/radio/deactivate`).set(auth(adminToken));
    expect(res.body.data).toMatchObject({ enabled: false, termsAccepted: true, active: false });
    expect((await request(app).get(`${API}/radio/tracks`).set(auth(adminToken))).status).toBe(403);

    const terms = await currentTerms();
    await request(app).post(`${API}/radio/activate`).set(auth(adminToken)).send(terms).expect(200);
  });
});

describe("Nova versão do termo e revogação", () => {
  it("nova versão que exige aceite tira a rádio do ar até aceitar de novo", async () => {
    const { syncDocuments } = await import("../services/legal.service");
    await syncDocuments([{ type: "radio_liability", title: "Termo da rádio", content: "ECAD v2\n" }]);

    let data = await status();
    expect(data).toMatchObject({ enabled: true, termsAccepted: false, active: false });
    expect(data.terms.version).toBe(2);

    const terms = await currentTerms();
    await request(app).post(`${API}/radio/activate`).set(auth(adminToken)).send(terms).expect(200);
    data = await status();
    expect(data).toMatchObject({ active: true, acceptedVersion: 2 });
  });

  it("revogar o termo desliga a rádio", async () => {
    const res = await request(app).post(`${API}/legal/radio_liability/revoke`).set(auth(adminToken)).send({});
    expect(res.status).toBe(201);
    expect(await status()).toMatchObject({ enabled: false, termsAccepted: false, active: false });
  });
});
