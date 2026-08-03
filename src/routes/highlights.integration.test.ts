import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let userId: string;
let userAccessToken: string;
let otherUserAccessToken: string;

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

  const user = await User.create({
    churchId: church._id,
    name: "Usuário Teste",
    email: "usuario@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });
  userId = String(user._id);

  const otherUser = await User.create({
    churchId: church._id,
    name: "Outro Usuário",
    email: "outro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  userAccessToken = signAccessToken({ sub: userId, churchId, roles: ["member"] });
  otherUserAccessToken = signAccessToken({ sub: String(otherUser._id), churchId, roles: ["member"] });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /athos_adm/api/highlights", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).post("/athos_adm/api/highlights").send({
      book: "João",
      chapter: 3,
      verseStart: 16,
      version: "NVI",
      text: "Porque Deus amou o mundo de tal maneira...",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("valida campos obrigatórios", async () => {
    const response = await request(app)
      .post("/athos_adm/api/highlights")
      .set("Authorization", `Bearer ${userAccessToken}`)
      .send({ book: "", chapter: 3, verseStart: 16, version: "NVI", text: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("valida verseEnd menor que verseStart", async () => {
    const response = await request(app)
      .post("/athos_adm/api/highlights")
      .set("Authorization", `Bearer ${userAccessToken}`)
      .send({
        book: "João",
        chapter: 3,
        verseStart: 16,
        verseEnd: 15,
        version: "NVI",
        text: "Porque Deus amou o mundo...",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("cria um destaque com visibility padrão 'public'", async () => {
    const response = await request(app)
      .post("/athos_adm/api/highlights")
      .set("Authorization", `Bearer ${userAccessToken}`)
      .send({
        book: "João",
        chapter: 3,
        verseStart: 16,
        version: "NVI",
        text: "Porque Deus amou o mundo de tal maneira...",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.userId).toBe(userId);
    expect(response.body.data.visibility).toBe("public");
    expect(response.body.data.likesCount).toBe(0);
    expect(response.body.data.liked).toBe(false);
  });

  it("cria um destaque com visibility 'friends'", async () => {
    const response = await request(app)
      .post("/athos_adm/api/highlights")
      .set("Authorization", `Bearer ${userAccessToken}`)
      .send({
        book: "Salmos",
        chapter: 23,
        verseStart: 1,
        verseEnd: 3,
        version: "NVI",
        text: "O Senhor é o meu pastor...",
        visibility: "friends",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.visibility).toBe("friends");
  });
});

describe("GET /athos_adm/api/highlights", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/highlights");

    expect(response.status).toBe(401);
  });

  it("retorna todos os próprios destaques, incluindo 'friends'", async () => {
    const response = await request(app)
      .get("/athos_adm/api/highlights")
      .set("Authorization", `Bearer ${userAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    const visibilities = response.body.data.map((item: { visibility: string }) => item.visibility);
    expect(visibilities).toContain("public");
    expect(visibilities).toContain("friends");
  });

  it("retorna só destaques 'public' de terceiros (friends ainda não implementado)", async () => {
    const response = await request(app)
      .get("/athos_adm/api/highlights")
      .query({ userId })
      .set("Authorization", `Bearer ${otherUserAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].visibility).toBe("public");
  });

  it("filtra os próprios destaques por visibility", async () => {
    const response = await request(app)
      .get("/athos_adm/api/highlights")
      .query({ visibility: "friends" })
      .set("Authorization", `Bearer ${userAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].visibility).toBe("friends");
  });
});

describe("POST /athos_adm/api/highlights/:id/like", () => {
  let publicHighlightId: string;
  let friendsHighlightId: string;

  beforeAll(async () => {
    const listResponse = await request(app)
      .get("/athos_adm/api/highlights")
      .set("Authorization", `Bearer ${userAccessToken}`);

    publicHighlightId = listResponse.body.data.find(
      (item: { visibility: string }) => item.visibility === "public",
    ).id;
    friendsHighlightId = listResponse.body.data.find(
      (item: { visibility: string }) => item.visibility === "friends",
    ).id;
  });

  it("rejeita requisição sem token", async () => {
    const response = await request(app).post(`/athos_adm/api/highlights/${publicHighlightId}/like`);

    expect(response.status).toBe(401);
  });

  it("curte o destaque na primeira chamada", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/highlights/${publicHighlightId}/like`)
      .set("Authorization", `Bearer ${otherUserAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ liked: true, likesCount: 1 });
  });

  it("descurte o destaque na segunda chamada (toggle)", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/highlights/${publicHighlightId}/like`)
      .set("Authorization", `Bearer ${otherUserAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ liked: false, likesCount: 0 });
  });

  it("404 ao tentar curtir um destaque 'friends' de outra pessoa", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/highlights/${friendsHighlightId}/like`)
      .set("Authorization", `Bearer ${otherUserAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("HIGHLIGHT_NOT_FOUND");
  });

  it("404 para destaque inexistente", async () => {
    const response = await request(app)
      .post(`/athos_adm/api/highlights/${new mongoose.Types.ObjectId()}/like`)
      .set("Authorization", `Bearer ${userAccessToken}`);

    expect(response.status).toBe(404);
  });
});

describe("DELETE /athos_adm/api/highlights/:id", () => {
  let highlightId: string;

  beforeAll(async () => {
    const response = await request(app)
      .post("/athos_adm/api/highlights")
      .set("Authorization", `Bearer ${userAccessToken}`)
      .send({
        book: "Filipenses",
        chapter: 4,
        verseStart: 13,
        version: "NVI",
        text: "Tudo posso naquele que me fortalece",
      });
    highlightId = response.body.data.id;
  });

  it("rejeita requisição sem token", async () => {
    const response = await request(app).delete(`/athos_adm/api/highlights/${highlightId}`);

    expect(response.status).toBe(401);
  });

  it("404 ao tentar remover destaque de outra pessoa", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/highlights/${highlightId}`)
      .set("Authorization", `Bearer ${otherUserAccessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("HIGHLIGHT_NOT_FOUND");
  });

  it("permite remoção pelo próprio dono", async () => {
    const response = await request(app)
      .delete(`/athos_adm/api/highlights/${highlightId}`)
      .set("Authorization", `Bearer ${userAccessToken}`);

    expect(response.status).toBe(204);
  });
});
