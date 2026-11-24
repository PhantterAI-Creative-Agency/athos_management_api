import crypto from "node:crypto";
import { Types } from "mongoose";
import { env } from "../config/env";
import { Church } from "../models/Church.model";
import { getBillingState } from "../helpers/plans.helper";
import { OAuthState } from "../models/OAuthState.model";
import { PaymentAccount } from "../models/PaymentAccount.model";
import { AppError } from "../middlewares/errorHandler";
import { auditLogWithCtx } from "../helpers/auditLogger.helper";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "../helpers/crypto.helper";
import {
  buildAuthorizationUrl,
  createPkcePair,
  exchangeAuthorizationCode,
  getMercadoPagoAppConfig,
  isMercadoPagoConfigured,
  MercadoPagoOAuthError,
  refreshAccessToken,
  type MercadoPagoTokenResponse,
} from "../helpers/mercadopago.helper";

const STATE_TTL_MS = 10 * 60 * 1000;
/** Renova quando faltar menos que isto para o token (180 dias) expirar. */
export const REFRESH_THRESHOLD_DAYS = 30;

export interface MercadoPagoStatusDTO {
  /** A plataforma tem a aplicação do Mercado Pago configurada. */
  available: boolean;
  connected: boolean;
  status: "not_connected" | "connected" | "needs_reconnect";
  mpUserId?: string;
  liveMode?: boolean;
  connectedAt?: string;
  expiresAt?: string;
  lastRefreshedAt?: string;
}

function assertReady(): void {
  getMercadoPagoAppConfig();
  if (!isEncryptionConfigured()) {
    throw new AppError(503, "MERCADOPAGO_NOT_CONFIGURED", "Criptografia de tokens não configurada na plataforma");
  }
}

function tokenFields(token: MercadoPagoTokenResponse) {
  return {
    accessTokenEnc: encryptSecret(token.access_token),
    ...(token.refresh_token ? { refreshTokenEnc: encryptSecret(token.refresh_token) } : {}),
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
    scope: token.scope,
    publicKey: token.public_key,
    liveMode: token.live_mode,
  };
}

/** Inicia a conexão: grava um `state` de uso único e devolve a URL de autorização. */
export async function startConnection(churchId: string, userId: string): Promise<{ authorizationUrl: string }> {
  assertReady();
  const church = await Church.findById(churchId).select("subscription").lean();
  if (getBillingState(church?.subscription).plan !== "completo") {
    throw new AppError(402, "PLAN_UPGRADE_REQUIRED", "O PIX com confirmação automática faz parte do plano Completo");
  }
  const config = getMercadoPagoAppConfig();
  const state = crypto.randomBytes(24).toString("base64url");
  const pkce = config.usePkce ? createPkcePair() : undefined;

  await OAuthState.create({
    state,
    provider: "mercadopago",
    churchId: new Types.ObjectId(churchId),
    userId: new Types.ObjectId(userId),
    codeVerifierEnc: pkce ? encryptSecret(pkce.verifier) : undefined,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  return { authorizationUrl: buildAuthorizationUrl(state, pkce?.challenge) };
}

export type CallbackResult = { ok: true; churchSlug: string } | { ok: false; churchSlug?: string; reason: string };

/**
 * Retorno do Mercado Pago (redirecionamento do navegador). Valida o `state` (uso único, 10 min),
 * troca o código pelos tokens e grava a conta da igreja. Nunca lança: o resultado vira um
 * redirecionamento para o painel.
 */
export async function handleCallback(params: { code?: string; state?: string; error?: string }): Promise<CallbackResult> {
  if (!params.state) return { ok: false, reason: "invalid_state" };

  // Marca como usado de forma atômica: um mesmo `state` não serve duas vezes.
  const attempt = await OAuthState.findOneAndUpdate(
    { state: params.state, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  if (!attempt) return { ok: false, reason: "invalid_state" };

  const church = await Church.findById(attempt.churchId).select("slug").lean();
  const churchSlug = church?.slug;
  if (params.error || !params.code) return { ok: false, churchSlug, reason: "access_denied" };

  try {
    const verifier = attempt.codeVerifierEnc ? decryptSecret(attempt.codeVerifierEnc) : undefined;
    const token = await exchangeAuthorizationCode(params.code, verifier);

    await PaymentAccount.findOneAndUpdate(
      { churchId: attempt.churchId },
      {
        $set: {
          provider: "mercadopago",
          status: "connected",
          mpUserId: String(token.user_id),
          ...tokenFields(token),
          connectedBy: attempt.userId,
          connectedAt: new Date(),
          lastRefreshedAt: new Date(),
          lastError: null,
        },
      },
      { upsert: true },
    );

    await auditLogWithCtx({
      action: "UPDATE",
      entity: "PaymentAccount",
      churchId: String(attempt.churchId),
      userId: String(attempt.userId),
      metadata: { provider: "mercadopago", event: "connected", mpUserId: String(token.user_id) },
    });

    return { ok: true, churchSlug: churchSlug ?? "" };
  } catch (error) {
    const detail = error instanceof MercadoPagoOAuthError ? `${error.status} ${error.code ?? ""}` : "erro";
    console.error(`[mercadopago-oauth] falha ao trocar o código: ${detail}`);
    return { ok: false, churchSlug, reason: "token_exchange_failed" };
  }
}

export function callbackRedirectUrl(result: CallbackResult): string {
  const base = (process.env.ADMIN_PANEL_URL ?? env.ADMIN_PANEL_URL ?? "").replace(/\/+$/, "");
  const path = result.churchSlug ? `/admin_athos/${result.churchSlug}/ofertas` : "/admin_athos";
  const query = result.ok ? "mercadopago=connected" : `mercadopago=error&reason=${result.reason}`;
  return `${base}${path}?${query}`;
}

export async function getStatus(churchId: string): Promise<MercadoPagoStatusDTO> {
  const available = isMercadoPagoConfigured() && isEncryptionConfigured();
  const account = await PaymentAccount.findOne({ churchId }).lean();
  if (!account || account.status === "disconnected") {
    return { available, connected: false, status: "not_connected" };
  }
  return {
    available,
    connected: account.status === "connected",
    status: account.status === "needs_reconnect" ? "needs_reconnect" : "connected",
    mpUserId: account.mpUserId ?? undefined,
    liveMode: account.liveMode ?? undefined,
    connectedAt: account.connectedAt?.toISOString(),
    expiresAt: account.expiresAt?.toISOString(),
    lastRefreshedAt: account.lastRefreshedAt?.toISOString(),
  };
}

/**
 * Desconecta: apaga os tokens do nosso lado. O Mercado Pago não oferece endpoint de revogação;
 * o admin deve remover a autorização também na conta dele (Seu negócio → Aplicações conectadas).
 */
export async function disconnect(churchId: string, userId: string): Promise<void> {
  const result = await PaymentAccount.updateOne(
    { churchId, status: { $ne: "disconnected" } },
    {
      $set: { status: "disconnected", lastError: null },
      $unset: { accessTokenEnc: 1, refreshTokenEnc: 1, expiresAt: 1, publicKey: 1 },
    },
  );
  if (result.matchedCount === 0) throw new AppError(404, "NOT_CONNECTED", "Nenhuma conta do Mercado Pago conectada");
  await auditLogWithCtx({
    action: "UPDATE",
    entity: "PaymentAccount",
    churchId,
    userId,
    metadata: { provider: "mercadopago", event: "disconnected" },
  });
}

/** Access token da igreja para cobranças (Sprint 5). `null` se não houver conta conectada. */
export async function getChurchAccessToken(churchId: string): Promise<string | null> {
  const account = await PaymentAccount.findOne({ churchId, status: "connected" }).select("+accessTokenEnc").lean();
  return account?.accessTokenEnc ? decryptSecret(account.accessTokenEnc) : null;
}

export interface RefreshSummary {
  checked: number;
  refreshed: number;
  failed: number;
}

/** Renova os tokens que vencem em menos de REFRESH_THRESHOLD_DAYS dias. Rodar diariamente. */
export async function refreshExpiringTokens(now = new Date()): Promise<RefreshSummary> {
  if (!isMercadoPagoConfigured() || !isEncryptionConfigured()) return { checked: 0, refreshed: 0, failed: 0 };

  const limit = new Date(now.getTime() + REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const accounts = await PaymentAccount.find({ status: "connected", expiresAt: { $lt: limit } }).select(
    "+refreshTokenEnc",
  );

  const summary: RefreshSummary = { checked: accounts.length, refreshed: 0, failed: 0 };
  for (const account of accounts) {
    try {
      if (!account.refreshTokenEnc) throw new MercadoPagoOAuthError(400, "missing_refresh_token", "Sem refresh token");
      const token = await refreshAccessToken(decryptSecret(account.refreshTokenEnc));
      account.set({ ...tokenFields(token), lastRefreshedAt: new Date(), lastError: null });
      await account.save();
      summary.refreshed += 1;
    } catch (error) {
      summary.failed += 1;
      const expired = !account.expiresAt || account.expiresAt <= now;
      const rejected = error instanceof MercadoPagoOAuthError && error.status >= 400 && error.status < 500;
      // Recusa definitiva (ex.: autorização revogada) ou token já vencido: pede nova conexão.
      if (rejected || expired) account.set("status", "needs_reconnect");
      account.set(
        "lastError",
        error instanceof MercadoPagoOAuthError ? `${error.status} ${error.code ?? error.message}` : "falha na renovação",
      );
      await account.save();
      console.error(`[mercadopago-oauth] falha ao renovar token da igreja ${String(account.churchId)}`);
    }
  }
  return summary;
}
