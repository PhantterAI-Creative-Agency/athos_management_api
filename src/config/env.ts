import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const ENV_FILES: Record<string, string> = {
  local: ".env.local",
  qa: ".env.qa",
  production: ".env.prod",
};

const appEnv = process.env.APP_ENV ?? "local";
dotenv.config({ path: path.resolve(process.cwd(), ENV_FILES[appEnv] ?? ENV_FILES.local) });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  MONGODB_URI: z.string().min(1, "MONGODB_URI é obrigatório"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET é obrigatório"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET é obrigatório"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  CORS_ORIGINS: z.string().default(""),
  REDIS_URL: z.string().optional(),
  BIBLE_API_BASE_URL: z.string().default("https://www.abibliadigital.com.br/api"),
  BIBLE_API_TOKEN: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("deepseek/deepseek-chat"),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  GMAIL_APP_NAME: z.string().optional(),
  GMAIL_APP_MAIL: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Variáveis de ambiente inválidas: ${parsed.error.message}`);
}

export const env = parsed.data;
