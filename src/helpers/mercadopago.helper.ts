import crypto from "node:crypto";
import { env } from "../config/env";
import { AppError } from "../middlewares/errorHandler";

export interface MercadoPagoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id: number | string;
  refresh_token?: string;
  public_key?: string;
  live_mode?: boolean;
}

export interface MercadoPagoAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  usePkce: boolean;
}

/** Credenciais da aplicação da Athos no Mercado Pago (lidas a cada uso). */
export function getMercadoPagoAppConfig(): MercadoPagoAppConfig {
  // Lidos de process.env a cada uso (o .env já foi carregado por config/env.ts).
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  const redirectUri = process.env.MP_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new AppError(
      503,
      "MERCADOPAGO_NOT_CONFIGURED",
      "Integração com o Mercado Pago ainda não configurada na plataforma",
    );
  }
  return { clientId, clientSecret, redirectUri, usePkce: (process.env.MP_USE_PKCE ?? env.MP_USE_PKCE) !== "false" };
}

export function isMercadoPagoConfigured(): boolean {
  try {
    getMercadoPagoAppConfig();
    return true;
  } catch {
    return false;
  }
}

/** PKCE (RFC 7636) com S256. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizationUrl(state: string, codeChallenge?: string): string {
  const config = getMercadoPagoAppConfig();
  const url = new URL("/authorization", process.env.MP_AUTH_BASE_URL ?? env.MP_AUTH_BASE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.redirectUri);
  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export class MercadoPagoOAuthError extends Error {
  status: number;
  code?: string;
  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function postToken(body: Record<string, string>): Promise<MercadoPagoTokenResponse> {
  const response = await fetch(new URL("/oauth/token", process.env.MP_API_BASE_URL ?? env.MP_API_BASE_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof json.access_token !== "string") {
    // Nunca inclui o corpo enviado (tem client_secret/refresh_token) na mensagem.
    const code = typeof json.error === "string" ? json.error : undefined;
    const message = typeof json.message === "string" ? json.message : `HTTP ${response.status}`;
    throw new MercadoPagoOAuthError(response.status, code, message);
  }
  return json as unknown as MercadoPagoTokenResponse;
}

export function exchangeAuthorizationCode(code: string, codeVerifier?: string): Promise<MercadoPagoTokenResponse> {
  const config = getMercadoPagoAppConfig();
  return postToken({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    test_token: "false",
    ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
  });
}

export function refreshAccessToken(refreshToken: string): Promise<MercadoPagoTokenResponse> {
  const config = getMercadoPagoAppConfig();
  return postToken({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}
