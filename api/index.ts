import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../src/app";
import { connectDB } from "../src/config/mongoose";

const app = createApp();

let dbConnection: ReturnType<typeof connectDB> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!dbConnection) {
    dbConnection = connectDB();
  }
  await dbConnection;

  app(req, res);
}
