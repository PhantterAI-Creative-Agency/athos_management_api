import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let userAId: string;
let userBId: string;
let userCId: string;
let otherChurchUserId: string;
let userAAccessToken: string;
let userBAccessToken: string;
let userCAccessToken: string;
let otherChurchUserAccessToken: string;

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

  const userA = await User.create({
    churchId: church._id,
    name: "Usuário A",
    email: "a@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  userAId = String(userA._id);

  const userB = await User.create({
    churchId: church._id,
    name: "Usuário B",
    email: "b@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  userBId = String(userB._id);

  const userC = await User.create({
    churchId: church._id,
    name: "Usuário C",
    email: "c@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  userCId = String(userC._id);

  const otherChurchUser = await User.create({
    churchId: otherChurch._id,
    name: "Usuário Outra Igreja",
    email: "outro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  otherChurchUserId = String(otherChurchUser._id);

  userAAccessToken = signAccessToken({ sub: userAId, churchId, roles: ["member"] });
  userBAccessToken = signAccessToken({ sub: userBId, churchId, roles: ["member"] });
  userCAccessToken = signAccessToken({ sub: userCId, churchId, roles: ["member"] });
  otherChurchUserAccessToken = signAccessToken({
    sub: otherChurchUserId,
    churchId: String(otherChurch._id),
    roles: ["member"],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/friends", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).post("/athos_adm/api/friends").send({ friendId: userBId });

    expect(response.status).toBe(401);
  });

  it("rejeita solicitação para si mesmo", async () => {
    const response = await request(app)
      .post("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userAAccessToken}`)
      .send({ friendId: userAId });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CANNOT_FRIEND_SELF");
  });

  it("retorna 404 para usuário de outra igreja", async () => {
    const response = await request(app)
      .post("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userAAccessToken}`)
      .send({ friendId: otherChurchUserId });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
  });

  it("cria uma solicitação pending", async () => {
    const response = await request(app)
      .post("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userAAccessToken}`)
      .send({ friendId: userBId });

    expect(response.status).toBe(201);
    expect(response.body.data.userId).toBe(userAId);
    expect(response.body.data.friendId).toBe(userBId);
    expect(response.body.data.status).toBe("pending");
  });

  it("rejeita solicitação duplicada", async () => {
    const response = await request(app)
      .post("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userAAccessToken}`)
      .send({ friendId: userBId });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("FRIENDSHIP_ALREADY_EXISTS");
  });

  it("rejeita solicitação reversa enquanto já existe uma pendente", async () => {
    const response = await request(app)
      .post("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userBAccessToken}`)
      .send({ friendId: userAId });

    expect(response.status).toBe(409);
  });
});

describe("GET /athos_adm/api/friends", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/friends");

    expect(response.status).toBe(401);
  });

  it("lista as solicitações em que o usuário participa (enviadas e recebidas)", async () => {
    const responseA = await request(app)
      .get("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userAAccessToken}`);

    expect(responseA.status).toBe(200);
    expect(responseA.body.data).toHaveLength(1);

    const responseB = await request(app)
      .get("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userBAccessToken}`);

    expect(responseB.status).toBe(200);
    expect(responseB.body.data).toHaveLength(1);
  });

  it("filtra por status", async () => {
    const response = await request(app)
      .get("/athos_adm/api/friends?status=accepted")
      .set("Authorization", `Bearer ${userAAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });
});

describe("PATCH /athos_adm/api/friends/:id", () => {
  it("rejeita quem não faz parte da solicitação", async () => {
    const list = await request(app)
      .get("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userAAccessToken}`);
    const friendshipId = list.body.data[0].id;

    const response = await request(app)
      .patch(`/athos_adm/api/friends/${friendshipId}`)
      .set("Authorization", `Bearer ${userCAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("rejeita quem enviou a solicitação tentando aceitar a própria", async () => {
    const list = await request(app)
      .get("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userAAccessToken}`);
    const friendshipId = list.body.data[0].id;

    const response = await request(app)
      .patch(`/athos_adm/api/friends/${friendshipId}`)
      .set("Authorization", `Bearer ${userAAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("quem recebeu aceita a solicitação e os contadores de amigos são atualizados", async () => {
    const list = await request(app)
      .get("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userBAccessToken}`);
    const friendshipId = list.body.data[0].id;

    const response = await request(app)
      .patch(`/athos_adm/api/friends/${friendshipId}`)
      .set("Authorization", `Bearer ${userBAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("accepted");

    const { User } = await import("../models/User.model");
    const userA = await User.findById(userAId);
    const userB = await User.findById(userBId);

    expect(userA?.friendsCount).toBe(1);
    expect(userB?.friendsCount).toBe(1);
  });

  it("retorna 409 ao tentar aceitar uma solicitação já respondida", async () => {
    const list = await request(app)
      .get("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userBAccessToken}`);
    const friendshipId = list.body.data[0].id;

    const response = await request(app)
      .patch(`/athos_adm/api/friends/${friendshipId}`)
      .set("Authorization", `Bearer ${userBAccessToken}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("FRIENDSHIP_INVALID_STATUS");
  });
});

describe("DELETE /athos_adm/api/friends/:id", () => {
  it("rejeita quem não faz parte da solicitação", async () => {
    const created = await request(app)
      .post("/athos_adm/api/friends")
      .set("Authorization", `Bearer ${userAAccessToken}`)
      .send({ friendId: userCId });
    const friendshipId = created.body.data.id;

    const response = await request(app)
      .delete(`/athos_adm/api/friends/${friendshipId}`)
      .set("Authorization", `Bearer ${userBAccessToken}`);

    expect(response.status).toBe(403);
  });

  it("participante remove/cancela a solicitação", async () => {
    const list = await request(app)
      .get("/athos_adm/api/friends?status=pending")
      .set("Authorization", `Bearer ${userAAccessToken}`);
    const friendshipId = list.body.data[0].id;

    const response = await request(app)
      .delete(`/athos_adm/api/friends/${friendshipId}`)
      .set("Authorization", `Bearer ${userCAccessToken}`);

    expect(response.status).toBe(204);
  });

  it("desfazer uma amizade aceita decrementa os contadores de ambos", async () => {
    const list = await request(app)
      .get("/athos_adm/api/friends?status=accepted")
      .set("Authorization", `Bearer ${userAAccessToken}`);
    const friendshipId = list.body.data[0].id;

    const response = await request(app)
      .delete(`/athos_adm/api/friends/${friendshipId}`)
      .set("Authorization", `Bearer ${userAAccessToken}`);

    expect(response.status).toBe(204);

    const { User } = await import("../models/User.model");
    const userA = await User.findById(userAId);
    const userB = await User.findById(userBId);

    expect(userA?.friendsCount).toBe(0);
    expect(userB?.friendsCount).toBe(0);
  });

  it("retorna 404 para solicitação inexistente", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/friends/${String(new mongoose.Types.ObjectId())}`)
      .set("Authorization", `Bearer ${userAAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("FRIENDSHIP_NOT_FOUND");
  });
});
