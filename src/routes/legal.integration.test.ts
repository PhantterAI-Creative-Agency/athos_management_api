import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

const API = "/athos_adm/api";
const VALID_CPF = "529.982.247-25";
const VALID_CNPJ = "11.222.333/0001-81";

let mongod: MongoMemoryServer;
let app: Express;
let devAdminToken: string;
let adminToken: string;
let memberToken: string;
let parentToken: string;
let childId: string;
let strangerId: string;
let memberId: string;

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
    name: "Igreja Esperança",
    logoUrl: "https://example.com/logo.png",
    slug: "igreja-esperanca",
  });
  const churchId = String(church._id);
  const passwordHash = await hashPassword("senha123");

  const mk = async (name: string, email: string, roles: string[], extra: Record<string, unknown> = {}) =>
    User.create({ churchId: church._id, name, email, passwordHash, roles, ...extra });

  const devAdmin = await mk("Dev Athos", "dev@athos.com", ["devAdmin"]);
  const admin = await mk("Admin", "admin@esperanca.com", ["admin"]);
  const member = await mk("Membro", "membro@esperanca.com", ["member"]);
  const child = await mk("Filho", "filho@esperanca.com", ["member"]);
  const stranger = await mk("Outro", "outro@esperanca.com", ["member"]);
  const parent = await mk("Pai", "pai@esperanca.com", ["member"], { familyData: { childrenIds: [child._id] } });

  childId = String(child._id);
  strangerId = String(stranger._id);
  memberId = String(member._id);

  const token = (id: unknown, roles: string[]) =>
    signAccessToken({ sub: String(id), churchId, roles: roles as never });
  devAdminToken = token(devAdmin._id, ["devAdmin"]);
  adminToken = token(admin._id, ["admin"]);
  memberToken = token(member._id, ["member"]);
  parentToken = token(parent._id, ["member"]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function publish(type: string, content: string, requiresReacceptance = true) {
  const res = await request(app)
    .post(`${API}/legal/documents`)
    .set("Authorization", `Bearer ${devAdminToken}`)
    .send({ type, title: `Documento ${type}`, content, requiresReacceptance });
  expect(res.status).toBe(201);
  return res.body.data as { version: number; contentHash: string };
}

function accept(token: string, type: string, body: Record<string, unknown>) {
  return request(app).post(`${API}/legal/${type}/accept`).set("Authorization", `Bearer ${token}`).send(body);
}

describe("Documentos legais — publicação e leitura", () => {
  it("só a equipe da plataforma (devAdmin) publica documentos", async () => {
    const res = await request(app)
      .post(`${API}/legal/documents`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "terms", title: "Termos", content: "x" });
    expect(res.status).toBe(403);
  });

  it("retorna 404 enquanto o documento não foi publicado", async () => {
    const res = await request(app).get(`${API}/legal/privacy/current`);
    expect(res.status).toBe(404);
  });

  it("publica v1 e exibe publicamente com o nome da igreja preenchido", async () => {
    const doc = await publish("terms", "Termos de {{churchName}} na plataforma {{platformName}}.");
    expect(doc.version).toBe(1);

    const res = await request(app).get(`${API}/legal/terms/current?churchSlug=igreja-esperanca`);
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe("Termos de Igreja Esperança na plataforma Athos Management.");
    expect(res.body.data.contentHash).toHaveLength(64);
  });

  it("rejeita tipo de documento inexistente", async () => {
    const res = await request(app).get(`${API}/legal/foo/current`);
    expect(res.status).toBe(400);
  });
});

describe("Aceite e pendências", () => {
  it("lista Termos como pendente para o membro, sem documentos da igreja", async () => {
    await publish("saas_contract", "Contrato com {{churchName}}");
    const res = await request(app).get(`${API}/legal/pending`).set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    const types = res.body.data.map((d: { type: string }) => d.type);
    expect(types).toEqual(["terms"]);
    expect(res.body.data[0].reason).toBe("never_accepted");
  });

  it("lista também o contrato da igreja para o admin", async () => {
    const res = await request(app).get(`${API}/legal/pending`).set("Authorization", `Bearer ${adminToken}`);
    const types = res.body.data.map((d: { type: string }) => d.type);
    expect(types).toEqual(["terms", "saas_contract"]);
  });

  it("recusa aceite de versão ou hash desatualizados", async () => {
    const res = await accept(memberToken, "terms", { version: 1, contentHash: "0".repeat(64) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LEGAL_VERSION_MISMATCH");
  });

  it("registra o aceite com evidências e remove a pendência", async () => {
    const current = (await request(app).get(`${API}/legal/terms/current`)).body.data;
    const res = await accept(memberToken, "terms", { version: current.version, contentHash: current.contentHash })
      .set("User-Agent", "vitest-agent")
      .set("X-Forwarded-For", "203.0.113.7");
    expect(res.status).toBe(201);
    expect(res.body.data.action).toBe("accept");

    const { LegalAcceptance } = await import("../models/LegalAcceptance.model");
    const stored = await LegalAcceptance.findById(res.body.data.id).lean();
    expect(stored?.userAgent).toBe("vitest-agent");
    expect(stored?.forwardedFor).toBe("203.0.113.7");
    expect(stored?.ip).toBeTruthy();
    expect(stored?.renderedHash).toHaveLength(64);
    expect(stored?.renderedHash).not.toBe(stored?.contentHash);

    const pending = await request(app).get(`${API}/legal/pending`).set("Authorization", `Bearer ${memberToken}`);
    expect(pending.body.data).toEqual([]);
  });

  it("versão sem exigência de reaceite não gera pendência; versão com exigência gera", async () => {
    await publish("terms", "Termos v2 (correção de digitação)", false);
    let pending = await request(app).get(`${API}/legal/pending`).set("Authorization", `Bearer ${memberToken}`);
    expect(pending.body.data).toEqual([]);

    await publish("terms", "Termos v3 (mudança relevante)", true);
    pending = await request(app).get(`${API}/legal/pending`).set("Authorization", `Bearer ${memberToken}`);
    expect(pending.body.data).toHaveLength(1);
    expect(pending.body.data[0]).toMatchObject({ type: "terms", version: 3, reason: "new_version" });
  });
});

describe("Contrato da igreja (representante legal)", () => {
  let contract: { version: number; contentHash: string };

  beforeAll(async () => {
    contract = (await request(app).get(`${API}/legal/saas_contract/current`)).body.data;
  });

  const signer = { name: "Pr. João da Silva", cpf: VALID_CPF, role: "Pastor presidente", cnpj: VALID_CNPJ };

  it("membro comum não aceita em nome da igreja", async () => {
    const res = await accept(memberToken, "saas_contract", { ...contract, signer });
    expect(res.status).toBe(403);
  });

  it("exige os dados do representante legal", async () => {
    const res = await accept(adminToken, "saas_contract", contract);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SIGNER_REQUIRED");
  });

  it("valida CPF e CNPJ", async () => {
    let res = await accept(adminToken, "saas_contract", { ...contract, signer: { ...signer, cpf: "111.111.111-11" } });
    expect(res.body.error.code).toBe("INVALID_CPF");
    res = await accept(adminToken, "saas_contract", { ...contract, signer: { ...signer, cnpj: "11.222.333/0001-00" } });
    expect(res.body.error.code).toBe("INVALID_CNPJ");
  });

  it("registra o aceite com o CPF mascarado na resposta", async () => {
    const res = await accept(adminToken, "saas_contract", { ...contract, signer });
    expect(res.status).toBe(201);
    expect(res.body.data.signer).toMatchObject({ name: signer.name, cpf: "***.982.247-**", cnpj: "11222333000181" });

    const pending = await request(app).get(`${API}/legal/pending`).set("Authorization", `Bearer ${adminToken}`);
    const types = pending.body.data.map((d: { type: string }) => d.type);
    expect(types).not.toContain("saas_contract");
  });
});

describe("Consentimento em nome de menor e revogação", () => {
  let consent: { version: number; contentHash: string };

  beforeAll(async () => {
    await publish("sensitive_data_consent", "Autorizo o tratamento de dados de saúde.");
    consent = (await request(app).get(`${API}/legal/sensitive_data_consent/current`)).body.data;
  });

  it("não é listado como pendência obrigatória", async () => {
    const pending = await request(app).get(`${API}/legal/pending`).set("Authorization", `Bearer ${parentToken}`);
    const types = pending.body.data.map((d: { type: string }) => d.type);
    expect(types).not.toContain("sensitive_data_consent");
  });

  it("só o responsável aceita em nome do filho", async () => {
    const res = await accept(parentToken, "sensitive_data_consent", { ...consent, onBehalfOfUserId: strangerId });
    expect(res.status).toBe(403);

    const ok = await accept(parentToken, "sensitive_data_consent", { ...consent, onBehalfOfUserId: childId });
    expect(ok.status).toBe(201);
    expect(ok.body.data.onBehalfOfUserId).toBe(childId);
  });

  it("não permite aceitar Termos em nome de outra pessoa", async () => {
    const terms = (await request(app).get(`${API}/legal/terms/current`)).body.data;
    const res = await accept(parentToken, "terms", { ...terms, onBehalfOfUserId: childId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ON_BEHALF_NOT_ALLOWED");
  });

  it("revoga o consentimento como novo registro, mantendo o histórico", async () => {
    const { hasActiveAcceptance } = await import("../services/legal.service");
    const { User } = await import("../models/User.model");
    const parent = await User.findOne({ email: "pai@esperanca.com" });
    const subject = {
      type: "sensitive_data_consent" as const,
      userId: String(parent!._id),
      onBehalfOfUserId: childId,
    };
    expect(await hasActiveAcceptance(subject)).toBe(true);

    const res = await request(app)
      .post(`${API}/legal/sensitive_data_consent/revoke`)
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ onBehalfOfUserId: childId });
    expect(res.status).toBe(201);
    expect(res.body.data.action).toBe("revoke");
    expect(await hasActiveAcceptance(subject)).toBe(false);

    const again = await request(app)
      .post(`${API}/legal/sensitive_data_consent/revoke`)
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ onBehalfOfUserId: childId });
    expect(again.status).toBe(404);
  });

  it("Termos não podem ser revogados", async () => {
    const res = await request(app)
      .post(`${API}/legal/terms/revoke`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NOT_REVOCABLE");
  });
});

describe("Imutabilidade das evidências", () => {
  it("bloqueia update e delete de aceites", async () => {
    const { LegalAcceptance } = await import("../models/LegalAcceptance.model");
    const record = await LegalAcceptance.findOne({ userId: memberId });
    expect(record).toBeTruthy();

    await expect(LegalAcceptance.updateOne({ _id: record!._id }, { $set: { version: 99 } })).rejects.toThrow(
      /não pode ser alterado/,
    );
    await expect(LegalAcceptance.deleteMany({})).rejects.toThrow(/não pode ser alterado/);
    await expect(record!.deleteOne()).rejects.toThrow(/não pode ser alterado/);

    record!.version = 99;
    await expect(record!.save()).rejects.toThrow(/não pode ser alterado/);
  });

  it("bloqueia edição de documentos publicados", async () => {
    const { LegalDocument } = await import("../models/LegalDocument.model");
    await expect(LegalDocument.updateMany({}, { $set: { content: "alterado" } })).rejects.toThrow(
      /não pode ser alterado/,
    );
  });
});

describe("Evidência de aceites (exportação)", () => {
  it("membro comum não exporta evidências", async () => {
    const res = await request(app).get(`${API}/legal/evidence`).set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  it("admin exporta a evidência da própria igreja com CPF completo e dados de rede", async () => {
    const res = await request(app).get(`${API}/legal/evidence`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("evidencias-aceite-igreja-esperanca");
    expect(res.body.data.church.slug).toBe("igreja-esperanca");

    const contract = res.body.data.records.find((r: { type: string }) => r.type === "saas_contract");
    expect(contract.signer.cpf).toBe("52998224725");
    expect(contract.documentTitle).toBe("Documento saas_contract");
    expect(contract.user.email).toBe("admin@esperanca.com");
    expect(contract.renderedHash).toHaveLength(64);

    const types = res.body.data.records.map((r: { type: string }) => r.type);
    expect(types).toContain("terms");
    expect(types).toContain("sensitive_data_consent");
  });

  it("filtra por tipo de documento", async () => {
    const res = await request(app)
      .get(`${API}/legal/evidence?type=saas_contract`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.data.records.every((r: { type: string }) => r.type === "saas_contract")).toBe(true);
  });

  it("admin não consegue exportar outra igreja passando churchId", async () => {
    const otherId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`${API}/legal/evidence?churchId=${otherId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.church.slug).toBe("igreja-esperanca");
  });

  it("devAdmin escolhe a igreja", async () => {
    const otherId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`${API}/legal/evidence?churchId=${otherId}`)
      .set("Authorization", `Bearer ${devAdminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Placeholders do fornecedor e da igreja", () => {
  it("preenche e-mail da igreja e dados do fornecedor", async () => {
    const { Church } = await import("../models/Church.model");
    await Church.updateOne({ slug: "igreja-esperanca" }, { $set: { "contact.email": "contato@esperanca.com" } });
    await publish("dpa", "{{churchEmail}} | {{providerName}} | {{forumCity}} | {{desconhecido}}");

    const res = await request(app).get(`${API}/legal/dpa/current?churchSlug=igreja-esperanca`);
    expect(res.body.data.content).toBe(
      "contato@esperanca.com | [RAZÃO SOCIAL DO FORNECEDOR] | [CIDADE/UF DO FORO] | {{desconhecido}}",
    );
  });
});

describe("Publicação a partir dos arquivos (legal:publish)", () => {
  it("os arquivos de conteúdo são válidos", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { parseLegalMarkdown } = await import("../services/legal.service");
    for (const type of ["terms", "privacy", "saas_contract", "dpa", "sensitive_data_consent"] as const) {
      const raw = await fs.readFile(path.resolve(__dirname, `../content/legal/${type}.md`), "utf8");
      const parsed = parseLegalMarkdown(type, raw);
      expect(parsed.title.length).toBeGreaterThan(3);
      expect(parsed.content).not.toMatch(/Princípios de Vida/);
      expect(parsed.content).toContain("{{");
    }
  });

  it("rejeita arquivo sem título", async () => {
    const { parseLegalMarkdown } = await import("../services/legal.service");
    expect(() => parseLegalMarkdown("terms", "sem título")).toThrow(/# Título/);
  });

  it("publica só o que mudou, e --minor não exige novo aceite", async () => {
    const { syncDocuments } = await import("../services/legal.service");
    const source = { type: "privacy" as const, title: "Política", content: "Texto v1\n" };

    const first = await syncDocuments([source]);
    expect(first[0]).toMatchObject({ status: "published", version: 1 });

    const again = await syncDocuments([source]);
    expect(again[0]).toMatchObject({ status: "unchanged", version: 1 });

    const minor = await syncDocuments([{ ...source, content: "Texto v1 corrigido\n" }], { minor: true });
    expect(minor[0]).toMatchObject({ status: "published", version: 2 });

    const doc = (await request(app).get(`${API}/legal/privacy/current`)).body.data;
    expect(doc.version).toBe(2);
    expect(doc.requiresReacceptance).toBe(false);
  });
});

describe("Placeholders no título", () => {
  it("preenche placeholders também no título e nas pendências", async () => {
    const res = await request(app)
      .post(`${API}/legal/documents`)
      .set("Authorization", `Bearer ${devAdminToken}`)
      .send({ type: "saas_contract", title: "Contrato — {{platformName}}", content: "Novo contrato" });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe("Contrato — Athos Management");

    const pending = await request(app).get(`${API}/legal/pending`).set("Authorization", `Bearer ${adminToken}`);
    const contract = pending.body.data.find((d: { type: string }) => d.type === "saas_contract");
    expect(contract.title).toBe("Contrato — Athos Management");
  });
});
