import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";
import { refreshExpiringTokens } from "../services/mercadopagoAccount.service";

const QUEUE_NAME = "mercadopago-token-refresh";

/**
 * Agenda a renovação diária dos tokens do Mercado Pago (04:17, horário do servidor) quando há
 * Redis. Sem Redis, use a rota interna POST /internal/cron/mercadopago-refresh-tokens num cron
 * da Hostinger.
 */
export async function scheduleMercadoPagoTokenRefresh(): Promise<void> {
  if (!env.REDIS_URL) return;

  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.add("refresh", {}, { repeat: { pattern: "17 4 * * *" }, jobId: "daily-refresh", removeOnComplete: 10 });

  new Worker(
    QUEUE_NAME,
    async () => {
      const summary = await refreshExpiringTokens();
      console.log(`[mercadopago-oauth] renovação: ${JSON.stringify(summary)}`);
    },
    { connection },
  );
}
