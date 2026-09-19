import type { CorsOptions } from "cors";
import { env } from "./env";

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

const allowedOrigins = new Set<string>();

for (const raw of env.CORS_ORIGINS.split(",")) {
  const origin = normalizeOrigin(raw);
  if (!origin) continue;
  allowedOrigins.add(origin);

  // aceita a variante com/sem "www" do mesmo domínio
  const withoutWww = origin.replace("://www.", "://");
  allowedOrigins.add(withoutWww);
  allowedOrigins.add(withoutWww.replace("://", "://www."));
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.size === 0 || allowedOrigins.has(normalizeOrigin(origin))) {
      callback(null, true);
      return;
    }
    // não lança erro: omite os cabeçalhos CORS (o navegador bloqueia) sem gerar 500
    callback(null, false);
  },
  credentials: true,
};
