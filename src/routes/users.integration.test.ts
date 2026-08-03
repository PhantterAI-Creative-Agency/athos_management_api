import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let otherChurchId: string;
let memberId: string;
let memberAccessToken: string;
let otherMemberAccessToken: string;
let adminAccessToken: string;
let otherChurchAdminAccessToken: string;
let devAdminAccessToken: string;
let parentId: string;
let parentAccessToken: string;
let spouseAccessToken: string;
let childId: string;
let unrelatedAccessToken: string;

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
    name: "Igreja Teste",
    logoUrl: "https://example.com/logo.png",
    slug: "igreja-teste",
    settings: { primaryColor: "#123456" },
  });
  churchId = String(church._id);

  const otherChurch = await Church.create({
    name: "Outra Igreja",
    logoUrl: "https://example.com/logo2.png",
    slug: "outra-igreja",
    settings: { primaryColor: "#654321" },
  });
  otherChurchId = String(otherChurch._id);

  const member = await User.create({
    churchId: church._id,
    name: "Membro Teste",
    email: "membro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  memberId = String(member._id);

  const otherMember = await User.create({
    churchId: church._id,
    name: "Outro Membro",
    email: "outromembro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  const admin = await User.create({
    churchId: church._id,
    name: "Admin Teste",
    email: "admin@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  const otherChurchAdmin = await User.create({
    churchId: otherChurch._id,
    name: "Admin Outra Igreja",
    email: "admin2@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  const devAdmin = await User.create({
    churchId: church._id,
    name: "Dev Admin",
    email: "devadmin@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["devAdmin"],
  });

  const child = await User.create({
    churchId: church._id,
    name: "Filho Teste",
    email: "filho@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["visitor"],
  });
  childId = String(child._id);

  const parent = await User.create({
    churchId: church._id,
    name: "Pai Teste",
    email: "pai@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
    familyData: { childrenIds: [child._id] },
  });
  parentId = String(parent._id);

  const spouse = await User.create({
    churchId: church._id,
    name: "Cônjuge Teste",
    email: "conjuge@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
    familyData: { spouseId: parent._id },
  });

  const unrelated = await User.create({
    churchId: church._id,
    name: "Sem Relação",
    email: "semrelacao@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  memberAccessToken = signAccessToken({ sub: memberId, churchId, roles: ["member"] });
  otherMemberAccessToken = signAccessToken({ sub: String(otherMember._id), churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  otherChurchAdminAccessToken = signAccessToken({
    sub: String(otherChurchAdmin._id),
    churchId: otherChurchId,
    roles: ["admin"],
  });
  devAdminAccessToken = signAccessToken({ sub: String(devAdmin._id), churchId, roles: ["devAdmin"] });
  parentAccessToken = signAccessToken({ sub: parentId, churchId, roles: ["member"] });
  spouseAccessToken = signAccessToken({ sub: String(spouse._id), churchId, roles: ["member"] });
  unrelatedAccessToken = signAccessToken({ sub: String(unrelated._id), churchId, roles: ["member"] });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/users", () => {
  it("permite que qualquer pessoa se cadastre, com papel visitor por padrão", async () => {
    const response = await request(app).post("/athos_adm/api/users").send({
      churchId,
      name: "Novo Visitante",
      email: "visitante@teste.com",
      password: "senha12345",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.roles).toEqual(["visitor"]);
    expect(response.body.data.active).toBe(true);
    expect(response.body.data.email).toBe("visitante@teste.com");
  });

  it("rejeita e-mail duplicado", async () => {
    const response = await request(app).post("/athos_adm/api/users").send({
      churchId,
      name: "Duplicado",
      email: "membro@teste.com",
      password: "senha12345",
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("rejeita igreja inexistente", async () => {
    const response = await request(app)
      .post("/athos_adm/api/users")
      .send({
        churchId: new mongoose.Types.ObjectId().toString(),
        name: "Sem Igreja",
        email: "semigreja@teste.com",
        password: "senha12345",
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CHURCH_NOT_FOUND");
  });

  it("valida o corpo da requisição", async () => {
    const response = await request(app).post("/athos_adm/api/users").send({ email: "invalido" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("ignora papéis enviados pelo cliente na criação", async () => {
    const response = await request(app)
      .post("/athos_adm/api/users")
      .send({
        churchId,
        name: "Tenta Admin",
        email: "tentaadmin@teste.com",
        password: "senha12345",
        roles: ["admin"],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.roles).toEqual(["visitor"]);
  });
});

describe("GET /athos_adm/api/users", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/users");

    expect(response.status).toBe(401);
  });

  it("rejeita usuário sem role admin", async () => {
    const response = await request(app)
      .get("/athos_adm/api/users")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("admin lista apenas usuários da própria igreja", async () => {
    const response = await request(app)
      .get("/athos_adm/api/users")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((user: { churchId: string }) => user.churchId === churchId),
    ).toBe(true);
  });

  it("devAdmin pode listar usuários de outra igreja via query churchId", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/users?churchId=${otherChurchId}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((user: { churchId: string }) => user.churchId === otherChurchId),
    ).toBe(true);
  });
});

describe("GET /athos_adm/api/users/:id", () => {
  it("permite que o próprio usuário veja seu perfil", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(memberId);
  });

  it("rejeita outro membro comum tentando ver perfil alheio", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("admin da mesma igreja pode ver o perfil", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(200);
  });

  it("admin de outra igreja não encontra o usuário", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${otherChurchAdminAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
  });

  it("devAdmin pode ver o perfil de qualquer igreja", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`);

    expect(response.status).toBe(200);
  });
});

describe("PATCH /athos_adm/api/users/:id", () => {
  it("permite que o próprio usuário atualize seus dados básicos", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ bio: "Nova bio", phone: "11999999999" });

    expect(response.status).toBe(200);
    expect(response.body.data.bio).toBe("Nova bio");
  });

  it("permite que o próprio usuário se inative", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ active: false });

    expect(response.status).toBe(200);
    expect(response.body.data.active).toBe(false);

    await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ active: true });
  });

  it("rejeita o próprio usuário tentando alterar seus papéis", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ roles: ["admin"] });

    expect(response.status).toBe(403);
  });

  it("rejeita outro membro comum tentando atualizar perfil alheio", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${otherMemberAccessToken}`)
      .send({ bio: "Invasão" });

    expect(response.status).toBe(403);
  });

  it("admin da mesma igreja pode alterar papéis do usuário", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ roles: ["member", "volunteer"] });

    expect(response.status).toBe(200);
    expect(response.body.data.roles).toEqual(["member", "volunteer"]);
  });

  it("admin comum não pode conceder o papel devAdmin", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ roles: ["devAdmin"] });

    expect(response.status).toBe(403);
  });

  it("devAdmin pode conceder o papel devAdmin", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${devAdminAccessToken}`)
      .send({ roles: ["devAdmin"] });

    expect(response.status).toBe(200);
    expect(response.body.data.roles).toEqual(["devAdmin"]);
  });

  it("valida o corpo da requisição", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ roles: ["papel-inexistente"] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Gestão de dados de filhos por pais/mães e cônjuges", () => {
  it("pai/mãe pode ver os dados do filho", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/users/${childId}`)
      .set("Authorization", `Bearer ${parentAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(childId);
  });

  it("pai/mãe pode atualizar dados cadastrais do filho", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${childId}`)
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .send({ phone: "11988887777", medicalRecord: { bloodType: "O+", allergies: ["poeira"] } });

    expect(response.status).toBe(200);
    expect(response.body.data.phone).toBe("11988887777");
    expect(response.body.data.medicalRecord.bloodType).toBe("O+");
  });

  it("cônjuge do pai/mãe também pode atualizar dados cadastrais do filho", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${childId}`)
      .set("Authorization", `Bearer ${spouseAccessToken}`)
      .send({ bio: "Atualizado pelo padrasto/madrasta" });

    expect(response.status).toBe(200);
    expect(response.body.data.bio).toBe("Atualizado pelo padrasto/madrasta");
  });

  it("rejeita usuário sem relação familiar tentando ver o filho", async () => {
    const response = await request(app)
      .get(`/athos_adm/api/users/${childId}`)
      .set("Authorization", `Bearer ${unrelatedAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("rejeita usuário sem relação familiar tentando atualizar o filho", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${childId}`)
      .set("Authorization", `Bearer ${unrelatedAccessToken}`)
      .send({ bio: "Invasão" });

    expect(response.status).toBe(403);
  });

  it("pai/mãe não pode alterar papéis do filho", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${childId}`)
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .send({ roles: ["admin"] });

    expect(response.status).toBe(403);
  });

  it("pai/mãe não pode ativar/inativar a conta do filho", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${childId}`)
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .send({ active: false });

    expect(response.status).toBe(403);
  });

  it("pai/mãe não pode reatribuir os dados familiares do filho", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${childId}`)
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .send({ familyData: { childrenIds: [] } });

    expect(response.status).toBe(403);
  });
});

describe("POST /athos_adm/api/users/:id/children", () => {
  it("permite que o responsável cadastre um filho menor de 13 anos sem login", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/users/${parentId}/children`)
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .send({ name: "Bebê Teste", birthDate: "2020-01-01" });

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBeUndefined();
    expect(response.body.data.roles).toEqual(["visitor"]);

    const parentResponse = await request(app)
      .get(`/athos_adm/api/users/${parentId}`)
      .set("Authorization", `Bearer ${parentAccessToken}`);

    expect(parentResponse.body.data.familyData.childrenIds).toContain(response.body.data.id);
  });

  it("rejeita login para filho menor de 13 anos", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/users/${parentId}/children`)
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .send({
        name: "Criança com Login",
        birthDate: "2015-01-01",
        email: "crianca@teste.com",
        password: "senha12345",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CHILD_LOGIN_NOT_ALLOWED");
  });

  it("permite login opcional para filho de 13 anos ou mais", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/users/${parentId}/children`)
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .send({
        name: "Adolescente Teste",
        birthDate: "2010-01-01",
        email: "adolescente@teste.com",
        password: "senha12345",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe("adolescente@teste.com");
  });

  it("rejeita quem não é o responsável nem admin", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/users/${parentId}/children`)
      .set("Authorization", `Bearer ${unrelatedAccessToken}`)
      .send({ name: "Intruso", birthDate: "2018-01-01" });

    expect(response.status).toBe(403);
  });
});

describe("Pré-cadastro e vínculo automático de cônjuge", () => {
  it("permite pré-cadastrar o cônjuge só com nome e telefone/e-mail", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({
        familyData: { spousePending: { name: "Futuro Cônjuge", email: "futuroconjuge@teste.com" } },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.familyData.spousePending.name).toBe("Futuro Cônjuge");
  });

  it("rejeita definir spouseId diretamente (vínculo é automático)", async () => {
    const response = await request(app)
      .patch(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`)
      .send({ familyData: { spouseId: parentId } });

    expect(response.status).toBe(403);
  });

  it("vincula automaticamente quando o cônjuge se cadastra com o e-mail pré-cadastrado", async () => {
    const registerResponse = await request(app).post("/athos_adm/api/users").send({
      churchId,
      name: "Futuro Cônjuge",
      email: "futuroconjuge@teste.com",
      password: "senha12345",
    });

    expect(registerResponse.status).toBe(201);

    const memberResponse = await request(app)
      .get(`/athos_adm/api/users/${memberId}`)
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(memberResponse.body.data.familyData.spouseId).toBe(registerResponse.body.data.id);
    expect(memberResponse.body.data.familyData.spousePending).toBeUndefined();

    const loginResponse = await request(app).post("/athos_adm/api/auth/login").send({
      email: "futuroconjuge@teste.com",
      password: "senha12345",
    });

    expect(loginResponse.body.data.user.id).toBe(registerResponse.body.data.id);
  });
});
