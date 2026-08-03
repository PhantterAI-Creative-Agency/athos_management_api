import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let accessToken: string;
let otherChurchAccessToken: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { Event } = await import("../models/Event.model");
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

  const otherChurch = await Church.create({
    name: "Outra Igreja",
    logoUrl: "https://example.com/logo2.png",
    slug: "outra-igreja",
    settings: { primaryColor: "#654321" },
  });

  const user = await User.create({
    churchId: church._id,
    name: "Membro Teste",
    email: "membro@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  const otherUser = await User.create({
    churchId: otherChurch._id,
    name: "Membro Outra Igreja",
    email: "membro2@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  accessToken = signAccessToken({ sub: String(user._id), churchId: String(church._id), roles: ["member"] });
  otherChurchAccessToken = signAccessToken({
    sub: String(otherUser._id),
    churchId: String(otherChurch._id),
    roles: ["member"],
  });

  await Event.create([
    {
      churchId: church._id,
      title: "Culto de Louvor e Adoração",
      imageUrl: "https://example.com/evento1.png",
      date: new Date(Date.now() + 86_400_000),
      location: "Templo Principal",
    },
    {
      churchId: church._id,
      title: "Evangelismo na Praça",
      imageUrl: "https://example.com/evento2.png",
      date: new Date(Date.now() - 86_400_000),
      location: "Praça Central",
    },
    {
      churchId: otherChurch._id,
      title: "Evento de Outra Igreja",
      imageUrl: "https://example.com/evento3.png",
      date: new Date(Date.now() + 86_400_000),
      location: "Outro Endereço",
    },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /athos_adm/api/events", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/events");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("lista apenas os eventos da igreja do usuário autenticado", async () => {
    const response = await request(app).get("/athos_adm/api/events").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.every((event: { title: string }) => event.title !== "Evento de Outra Igreja")).toBe(
      true,
    );
  });

  it("isola eventos por igreja para outro usuário", async () => {
    const response = await request(app)
      .get("/athos_adm/api/events")
      .set("Authorization", `Bearer ${otherChurchAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toBe("Evento de Outra Igreja");
  });

  it("filtra apenas eventos futuros quando upcoming=true", async () => {
    const response = await request(app)
      .get("/athos_adm/api/events?upcoming=true")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toBe("Culto de Louvor e Adoração");
  });

  it("retorna os eventos ordenados por data crescente", async () => {
    const response = await request(app).get("/athos_adm/api/events").set("Authorization", `Bearer ${accessToken}`);

    const dates = response.body.data.map((event: { date: string }) => new Date(event.date).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });
});
