import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

const API = "/athos_adm/api";

let mongod: MongoMemoryServer;
let app: Express;
let uploadDir: string;
let devToken: string;
let pilotAdminToken: string;
let newChurchId: string;
let signToken: (sub: string, churchId: string, roles: string[]) => string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  uploadDir = mkdtempSync(path.join(os.tmpdir(), "platform-uploads-"));
  process.env.UPLOAD_DIR = uploadDir;

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { hashPassword } = await import("../helpers/password.helper");
  const { signAccessToken } = await import("../helpers/jwt.helper");

  await connectDB(process.env.MONGODB_URI);
  app = createApp();
  signToken = (sub, churchId, roles) => signAccessToken({ sub, churchId, roles: roles as never });

  const pilot = await Church.create({ name: "Piloto", logoUrl: "x", slug: "piloto" });
  const passwordHash = await hashPassword("senha123");
  const dev = await User.create({ churchId: pilot._id, name: "Dev", email: "dev@athos.com", passwordHash, roles: ["devAdmin"] });
  const admin = await User.create({ churchId: pilot._id, name: "Admin", email: "admin@piloto.com", passwordHash, roles: ["admin"] });
  devToken = signToken(String(dev._id), String(pilot._id), ["devAdmin"]);
  pilotAdminToken = signToken(String(admin._id), String(pilot._id), ["admin"]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  rmSync(uploadDir, { recursive: true, force: true });
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("Criação de igreja pela plataforma", () => {
  it("só a equipe da plataforma cria igrejas (inclusive a rota antiga, antes pública)", async () => {
    const body = { name: "Nova", admin: { name: "A", email: "a@b.com" } };
    expect((await request(app).post(`${API}/platform/churches`).set(auth(pilotAdminToken)).send(body)).status).toBe(403);
    expect((await request(app).post(`${API}/churches`).send({ name: "X", logoUrl: "x" })).status).toBe(401);
  });

  it("cria igreja, domínio e primeiro administrador sem senha", async () => {
    const res = await request(app)
      .post(`${API}/platform/churches`)
      .set(auth(devToken))
      .send({
        name: "Igreja Esperança Viva",
        domains: ["https://www.EsperancaViva.org.br/", "esperanca.athos.app"],
        storageMb: 1,
        admin: { name: "Pr. Carlos", email: "Carlos@EsperancaViva.org.br" },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.church).toMatchObject({
      slug: "igreja-esperanca-viva",
      domains: ["esperancaviva.org.br", "esperanca.athos.app"],
    });
    newChurchId = res.body.data.church.id;

    const { User } = await import("../models/User.model");
    const admin = await User.findById(res.body.data.adminId).select("+passwordHash").lean();
    expect(admin).toMatchObject({ email: "carlos@esperancaviva.org.br", roles: ["admin"], active: true });
    expect(admin?.passwordHash).toBeUndefined();
  });

  it("recusa endereço, e-mail ou domínio repetidos", async () => {
    const base = { admin: { name: "Outro", email: "novo@x.com" } };
    let res = await request(app).post(`${API}/platform/churches`).set(auth(devToken)).send({ ...base, name: "Igreja Esperança Viva" });
    expect(res.body.error.code).toBe("SLUG_ALREADY_EXISTS");
    res = await request(app)
      .post(`${API}/platform/churches`)
      .set(auth(devToken))
      .send({ name: "Outra", admin: { name: "Xavier", email: "carlos@esperancaviva.org.br" } });
    expect(res.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
    res = await request(app).post(`${API}/platform/churches`).set(auth(devToken)).send({ ...base, name: "Outra", domains: ["esperanca.athos.app"] });
    expect(res.body.error.code).toBe("DOMAIN_IN_USE");
  });

  it("o convite explica como criar a senha", async () => {
    const { buildAdminInviteMessage } = await import("../jobs/adminInviteEmail.job");
    const msg = buildAdminInviteMessage({ to: "c@x.com", name: "Carlos", churchName: "Igreja X", siteUrl: "https://x.org" });
    expect(msg.text).toContain("https://x.org/esqueci-a-senha");
    expect(msg.text).toContain("c@x.com");
  });
});

describe("Igreja pelo endereço do site", () => {
  it("resolve com ou sem www, porta e maiúsculas", async () => {
    for (const host of ["esperancaviva.org.br", "WWW.EsperancaViva.org.br:443", "esperanca.athos.app"]) {
      const res = await request(app).get(`${API}/public/church-by-host`).query({ host });
      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBe("igreja-esperanca-viva");
    }
    expect((await request(app).get(`${API}/public/church-by-host`).query({ host: "desconhecido.org" })).status).toBe(404);
  });

  it("a plataforma altera os domínios", async () => {
    const res = await request(app)
      .patch(`${API}/platform/churches/${newChurchId}`)
      .set(auth(devToken))
      .send({ domains: ["esperanca.athos.app", "igrejaesperanca.com"] });
    expect(res.body.data.domains).toEqual(["esperanca.athos.app", "igrejaesperanca.com"]);
    expect((await request(app).get(`${API}/public/church-by-host`).query({ host: "esperancaviva.org.br" })).status).toBe(404);
  });
});

describe("Tema da igreja", () => {
  it("o padrão traz todas as seções da home visíveis", async () => {
    const res = await request(app).get(`${API}/public/churches/piloto`);
    expect(res.body.data.settings.theme.fontFamily).toBe("geist");
    expect(res.body.data.settings.theme.homeSections.map((s: { id: string }) => s.id)).toEqual([
      "about", "welcome", "events", "media", "featured", "devotionals", "ministries", "contact",
    ]);
  });

  it("admin salva cores, fonte e ordem das seções; seções omitidas entram no fim", async () => {
    const res = await request(app)
      .put(`${API}/churches/me/theme`)
      .set(auth(pilotAdminToken))
      .send({
        accentColor: "#1d4ed8",
        fontFamily: "poppins",
        heroImageUrl: "https://cdn.exemplo.org/templo.jpg",
        homeSections: [
          { id: "events", visible: true },
          { id: "about", visible: false },
        ],
      });
    expect(res.status).toBe(200);
    const theme = res.body.data.settings.theme;
    expect(theme).toMatchObject({ accentColor: "#1d4ed8", fontFamily: "poppins", heroImageUrl: "https://cdn.exemplo.org/templo.jpg" });
    expect(theme.homeSections.slice(0, 2)).toEqual([
      { id: "events", visible: true },
      { id: "about", visible: false },
    ]);
    expect(theme.homeSections).toHaveLength(8);
  });

  it("valida cor e seções; null volta ao padrão", async () => {
    expect((await request(app).put(`${API}/churches/me/theme`).set(auth(pilotAdminToken)).send({ accentColor: "azul" })).status).toBe(400);
    expect(
      (await request(app).put(`${API}/churches/me/theme`).set(auth(pilotAdminToken)).send({
        homeSections: [{ id: "about", visible: true }, { id: "about", visible: false }],
      })).status,
    ).toBe(400);
    const res = await request(app).put(`${API}/churches/me/theme`).set(auth(pilotAdminToken)).send({ accentColor: null });
    expect(res.body.data.settings.theme.accentColor).toBeUndefined();
    expect(res.body.data.settings.theme.fontFamily).toBe("poppins");
  });
});

describe("Importação de membros por CSV", () => {
  const csv = [
    "Nome;E-mail;Telefone;Nascimento;Sexo;Membro",
    'Ana Souza;ana@x.com;(11) 90000-0001;15/03/1990;F;sim',
    '"Silva, João";joao@x.com;;31/02/1990;M;sim',
    "Pedro;admin@piloto.com;;;M;não",
    ";sem-nome@x.com;;;;",
    "Marta;ana@x.com;;;;",
    "Lucas;;;01/01/2001;masculino;não",
  ].join("\r\n");

  it("simula a importação e lista os problemas por linha", async () => {
    const res = await request(app).post(`${API}/users/import`).set(auth(pilotAdminToken)).send({ csv, dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ dryRun: true, totalRows: 6, created: 2 });
    expect(res.body.data.skipped).toEqual([
      { line: 3, reason: "Data de nascimento inválida (use DD/MM/AAAA)" },
      { line: 4, reason: "E-mail já cadastrado na plataforma" },
      { line: 5, reason: "Nome ausente" },
      { line: 6, reason: "E-mail repetido na planilha" },
    ]);
    const { User } = await import("../models/User.model");
    expect(await User.exists({ email: "ana@x.com" })).toBeNull();
  });

  it("importa de verdade, como membros ativos da igreja do admin", async () => {
    const res = await request(app).post(`${API}/users/import`).set(auth(pilotAdminToken)).send({ csv });
    expect(res.body.data.created).toBe(2);
    const { User } = await import("../models/User.model");
    const ana = await User.findOne({ email: "ana@x.com" }).lean();
    expect(ana).toMatchObject({ name: "Ana Souza", gender: "F", roles: ["member"], active: true, isChurchMember: true });
    expect(ana?.birthDate?.toISOString()).toBe("1990-03-15T00:00:00.000Z");
    const lucas = await User.findOne({ name: "Lucas" }).lean();
    expect(lucas).toMatchObject({ roles: ["visitor"], isChurchMember: false, gender: "M" });
  });

  it("exige a coluna nome e só admin importa", async () => {
    expect((await request(app).post(`${API}/users/import`).set(auth(pilotAdminToken)).send({ csv: "email\na@b.com" })).body.error.code).toBe("CSV_MISSING_NAME");
    const { User } = await import("../models/User.model");
    const member = await User.findOne({ name: "Ana Souza" });
    const token = signToken(String(member!._id), String(member!.churchId), ["member"]);
    expect((await request(app).post(`${API}/users/import`).set(auth(token)).send({ csv })).status).toBe(403);
  });
});

describe("Uso e limite de armazenamento", () => {
  it("bloqueia envio que passa do limite da igreja", async () => {
    const { syncDocuments } = await import("../services/legal.service");
    await syncDocuments([{ type: "radio_liability", title: "Termo", content: "ECAD\n" }]);
    const terms = (await request(app).get(`${API}/legal/radio_liability/current`)).body.data;

    const { User } = await import("../models/User.model");
    const admin = await User.findOne({ email: "carlos@esperancaviva.org.br" });
    const token = signToken(String(admin!._id), newChurchId, ["admin"]);
    await request(app).post(`${API}/radio/activate`).set(auth(token)).send(terms).expect(200);

    const upload = (size: number) =>
      request(app)
        .post(`${API}/radio/tracks/upload?type=music&duration=60`)
        .set(auth(token))
        .set("Content-Type", "audio/mpeg")
        .set("X-File-Name", "louvor.mp3")
        .send(Buffer.alloc(size, 1));

    expect((await upload(600 * 1024)).status).toBe(201);
    const blocked = await upload(600 * 1024);
    expect(blocked.status).toBe(413);
    expect(blocked.body.error.code).toBe("STORAGE_LIMIT_EXCEEDED");

    const usage = await request(app).get(`${API}/platform/churches/${newChurchId}/usage`).set(auth(devToken));
    expect(usage.body.data).toMatchObject({ members: 1, storageBytes: 600 * 1024, storageLimitBytes: 1024 * 1024, mercadoPagoConnected: false });
  });

  it("lista as igrejas com o uso", async () => {
    const res = await request(app).get(`${API}/platform/churches`).set(auth(devToken));
    expect(res.body.data.map((c: { slug: string }) => c.slug)).toEqual(["igreja-esperanca-viva", "piloto"]);
    expect(res.body.data[1].usage.members).toBeGreaterThanOrEqual(4);
  });
});
