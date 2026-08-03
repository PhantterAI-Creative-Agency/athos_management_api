import rateLimit from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import Redis from "ioredis";
import { env } from "../config/env";
import { sendError } from "../helpers/response.helper";

const redisClient = env.REDIS_URL ? new Redis(env.REDIS_URL) : undefined;

function buildLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: redisClient
      ? new RedisStore({
          sendCommand: (...args: string[]) =>
            redisClient.call(args[0], ...args.slice(1)) as Promise<RedisReply>,
        })
      : undefined,
    handler: (_req, res) => {
      sendError(res, 429, "TOO_MANY_REQUESTS", "Muitas tentativas. Tente novamente em instantes.");
    },
  });
}

export const authLimiter = buildLimiter(15 * 60 * 1000, 10);
