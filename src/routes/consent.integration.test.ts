import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

const API = "/athos_adm/api";

let mongod: MongoMemoryServer;
let app: Express;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
const docs: Record<string, { version: number; contentHash: string }> = {};

const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

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

  const church = await Church.create({ name: "Igreja Consentimento", logoUrl: "x", slug: "igreja-consentimento" });
  const churchId = String(church._id);
  const passwordHash = await hashPassword("senha123");
  const mk = (name: string, email: string, roles: string[], extra: Record<string, unknown> = {}) =>
    User.create({ churchId, name, email, passwordHash, roles, active: true, ...extra });

  const child = await mk("Filho", "filho@c.com", ["member"], {
    medicalRecord: { bloodType: "A+", allergies: ["amendoim"] },
  });
  const parent = await mk("Mãe", "mae@c.com", ["member"], { familyData: { childrenIds: [child._id] } });
  const spouse = await mk("Pai", "pai@c.com", ["member"], { familyData: { spouseId: parent._id } });
  const member = await mk("Membro", "membro@c.com", ["member"], {
    medicalRecord: { bloodType: "O-", allergies: [] },
  });
  const admin = await mk("Admin", "admin@c.com", ["admin"]);

  for (const [key, user] of Object.entries({ child, parent, spouse, member, admin })) {
    ids[key] = String(user._id);
    tokens[key] = signAccessToken({ sub: String(user._id), churchId, roles: user.roles as never });
  }

  await syncDocuments([
    { type: "terms", title: "Termos", content: "Termos\n" },
    { type: "privacy", title: "Política", content: "Política\n" },
    { type: "sensitive_data_consent", title: "Consentimento", content: "Autorizo dados de saúde\n" },
  ]);
  for (const type of ["terms", "privacy", "sensitive_data_consent"]) {
    docs[type] = (await request(app).get(`${API}/legal/${type}/current`)).body.data;
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const consent = (who: string, onBehalfOfUserId?: string) =>
  request(app)
    .post(`${API}/legal/sensitive_data_consent/accept`)
    .set(auth(who))
    .send({ ...docs.sensitive_data_consent, onBehalfOfUserId });

describe("Ficha médica exige consentimento", () => {
  it("oculta a ficha médica já existente enquanto não há consentimento", async () => {
    const res = await request(app).get(`${API}/users/${ids.member}`).set(auth("member"));
    expect(res.status).toBe(200);
    expect(res.body.data.medicalRecord).toBeUndefined();
    expect(res.body.data.sensitiveDataConsent).toBe(false);
  });

  it("recusa gravar a ficha médica sem consentimento — inclusive pelo admin", async () => {
    let res = await request(app)
      .patch(`${API}/users/${ids.member}`)
      .set(auth("member"))
      .send({ medicalRecord: { bloodType: "B+" } });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CONSENT_REQUIRED");

    res = await request(app)
      .patch(`${API}/users/${ids.member}`)
      .set(auth("admin"))
      .send({ medicalRecord: { bloodType: "B+" } });
    expect(res.status).toBe(403);
  });

  it("outros campos continuam editáveis sem consentimento", async () => {
    const res = await request(app).patch(`${API}/users/${ids.member}`).set(auth("member")).send({ bio: "Olá" });
    expect(res.status).toBe(200);
  });

  it("após o consentimento, exibe e permite editar a ficha médica", async () => {
    expect((await consent("member")).status).toBe(201);

    let res = await request(app).get(`${API}/users/${ids.member}`).set(auth("member"));
    expect(res.body.data.sensitiveDataConsent).toBe(true);
    expect(res.body.data.medicalRecord).toEqual({ bloodType: "O-", allergies: [] });

    res = await request(app)
      .patch(`${API}/users/${ids.member}`)
      .set(auth("member"))
      .send({ medicalRecord: { bloodType: "B+", allergies: ["lactose"] } });
    expect(res.status).toBe(200);
    expect(res.body.data.medicalRecord).toEqual({ bloodType: "B+", allergies: ["lactose"] });
  });

  it("a listagem do admin mostra a ficha só de quem consentiu", async () => {
    const res = await request(app).get(`${API}/users`).set(auth("admin"));
    const byId = new Map(res.body.data.map((u: { id: string }) => [u.id, u]));
    expect((byId.get(ids.member) as { medicalRecord?: unknown }).medicalRecord).toBeDefined();
    expect((byId.get(ids.child) as { medicalRecord?: unknown }).medicalRecord).toBeUndefined();
  });

  it("revogar apaga a ficha médica", async () => {
    const res = await request(app).post(`${API}/legal/sensitive_data_consent/revoke`).set(auth("member")).send({});
    expect(res.status).toBe(201);

    const { User } = await import("../models/User.model");
    const stored = await User.findById(ids.member).lean();
    expect(stored?.medicalRecord?.bloodType).toBeUndefined();

    const after = await request(app).get(`${API}/users/${ids.member}`).set(auth("member"));
    expect(after.body.data.sensitiveDataConsent).toBe(false);
  });
});

describe("Consentimento de menores", () => {
  it("responsável consente em nome do filho e edita a ficha", async () => {
    expect((await consent("parent", ids.child)).status).toBe(201);

    const res = await request(app)
      .patch(`${API}/users/${ids.child}`)
      .set(auth("parent"))
      .send({ medicalRecord: { bloodType: "A+", allergies: ["amendoim", "glúten"] } });
    expect(res.status).toBe(200);
    expect(res.body.data.sensitiveDataConsent).toBe(true);
  });

  it("o consentimento vale para o titular, mesmo visto por outro responsável", async () => {
    const res = await request(app).get(`${API}/users/${ids.child}`).set(auth("spouse"));
    expect(res.status).toBe(200);
    expect(res.body.data.medicalRecord.allergies).toContain("glúten");
  });

  it("quem não é responsável não consente em nome do menor", async () => {
    expect((await consent("member", ids.child)).status).toBe(403);
  });

  it("o outro responsável pode revogar, e isso apaga a ficha do filho", async () => {
    const res = await request(app)
      .post(`${API}/legal/sensitive_data_consent/revoke`)
      .set(auth("spouse"))
      .send({ onBehalfOfUserId: ids.child });
    expect(res.status).toBe(201);
    expect(res.body.data.onBehalfOfUserId).toBe(ids.child);

    const { User } = await import("../models/User.model");
    expect((await User.findById(ids.child).lean())?.medicalRecord?.bloodType).toBeUndefined();

    const { hasSensitiveConsent } = await import("../services/legal.service");
    expect(await hasSensitiveConsent(ids.child)).toBe(false);
    // O consentimento do próprio responsável não é afetado.
    expect(await hasSensitiveConsent(ids.spouse)).toBe(false);
  });
});

describe("Aceite no cadastro", () => {
  const base = {
    churchSlug: "igreja-consentimento",
    password: "senha12345",
    isChurchMember: true,
  };

  it("registra Termos, Política e consentimento enviados no formulário", async () => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({
        ...base,
        name: "Novo Membro",
        email: "novo@c.com",
        legalAcceptances: [
          { type: "terms", ...docs.terms },
          { type: "privacy", ...docs.privacy },
          { type: "sensitive_data_consent", ...docs.sensitive_data_consent },
        ],
      })
      .set("User-Agent", "cadastro-teste");
    expect(res.status).toBe(201);

    const { User } = await import("../models/User.model");
    const { LegalAcceptance } = await import("../models/LegalAcceptance.model");
    const user = await User.findOne({ email: "novo@c.com" });
    const records = await LegalAcceptance.find({ userId: user!._id }).lean();
    expect(records.map((r) => r.documentType).sort()).toEqual(["privacy", "sensitive_data_consent", "terms"]);
    expect(records.every((r) => r.userAgent === "cadastro-teste")).toBe(true);
  });

  it("recusa versão desatualizada sem criar o usuário", async () => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({
        ...base,
        name: "Desatualizado",
        email: "velho@c.com",
        legalAcceptances: [{ type: "terms", version: 1, contentHash: "0".repeat(64) }],
      });
    expect(res.status).toBe(409);
    const { User } = await import("../models/User.model");
    expect(await User.exists({ email: "velho@c.com" })).toBeNull();
  });

  it("não aceita contrato da igreja pelo cadastro", async () => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({
        ...base,
        name: "Esperto",
        email: "esperto@c.com",
        legalAcceptances: [{ type: "saas_contract", version: 1, contentHash: "0".repeat(64) }],
      });
    expect(res.status).toBe(400);
  });

  it("continua aceitando cadastro sem aceites (versões antigas do app)", async () => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...base, name: "App Antigo", email: "antigo@c.com" });
    expect(res.status).toBe(201);
  });
});

describe("Exportação dos dados do titular", () => {
  it("exige login", async () => {
    expect((await request(app).get(`${API}/users/me/export`)).status).toBe(401);
  });

  it("exporta perfil, filhos e registros, sem segredos e sem ficha médica não consentida", async () => {
    await consent("parent", ids.child);
    const { User } = await import("../models/User.model");
    await User.updateOne({ _id: ids.child }, { $set: { medicalRecord: { bloodType: "AB+" } } });

    const res = await request(app).get(`${API}/users/me/export`).set(auth("parent"));
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("meus-dados-");
    const data = res.body.data;
    expect(data.profile.email).toBe("mae@c.com");
    expect(data.profile.passwordHash).toBeUndefined();
    expect(data.profile.sensitiveDataConsent).toBe(false);
    expect(data.children).toHaveLength(1);
    expect(data.children[0].medicalRecord.bloodType).toBe("AB+");
    expect(data.records.legalAcceptances.length).toBeGreaterThan(0);
    expect(Object.keys(data.records)).toEqual(
      expect.arrayContaining(["offerings", "eventRegistrations", "muralPosts", "assistantMessages"]),
    );
  });
});

describe("Solicitação de exclusão de dados", () => {
  it("registra o pedido de incluir os filhos", async () => {
    const res = await request(app)
      .post(`${API}/data-deletion-requests`)
      .send({ name: "Mãe", email: "mae@c.com", includeChildren: true });
    expect(res.status).toBe(201);
    expect(res.body.data.includeChildren).toBe(true);
  });
});
