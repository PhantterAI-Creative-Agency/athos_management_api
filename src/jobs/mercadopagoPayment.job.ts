import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";
import { listPendingForReconciliation, syncMercadoPagoPayment } from "../services/mercadopagoPayments.service";
import { confirmEventRegistrationPayment } from "../services/eventRegistrations.service";

const QUEUE_NAME = "mercadopago-payments";

const connection = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : undefined;
const queue = connection ? new Queue<{ paymentId: string }>(QUEUE_NAME, { connection }) : undefined;

/** Confere um pagamento no Mercado Pago e, se virou pago, confirma a inscrição do evento. */
export async function handleMercadoPagoPayment(paymentId: string): Promise<void> {
  const result = await syncMercadoPagoPayment(paymentId);
  if (result?.becamePaid && result.type === "event_registration") {
    await confirmEventRegistrationPayment(result.offeringId);
  }
}

if (connection) {
  new Worker<{ paymentId: string }>(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "reconcile") {
        await reconcileMercadoPagoPayments();
        return;
      }
      await handleMercadoPagoPayment(job.data.paymentId);
    },
    { connection },
  );
}

/**
 * Notificação recebida: com Redis vai para a fila (com novas tentativas); sem Redis é processada
 * na hora e o erro sobe para o Mercado Pago tentar de novo.
 */
export async function enqueueMercadoPagoPayment(paymentId: string): Promise<void> {
  if (queue) {
    await queue.add(
      "notification",
      { paymentId },
      { attempts: 5, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: 1000 },
    );
    return;
  }
  await handleMercadoPagoPayment(paymentId);
}

export interface ReconcileSummary {
  checked: number;
  failed: number;
}

/** Cobre notificações perdidas: confere no Mercado Pago as ofertas que seguem pendentes. */
export async function reconcileMercadoPagoPayments(): Promise<ReconcileSummary> {
  const paymentIds = await listPendingForReconciliation();
  const summary: ReconcileSummary = { checked: paymentIds.length, failed: 0 };
  for (const paymentId of paymentIds) {
    try {
      await handleMercadoPagoPayment(paymentId);
    } catch {
      summary.failed += 1;
      console.error(`[mercadopago-pix] falha ao conciliar o pagamento ${paymentId}`);
    }
  }
  return summary;
}

/** Conciliação a cada 10 minutos quando há Redis (sem Redis, use a rota interna de cron). */
export async function scheduleMercadoPagoReconciliation(): Promise<void> {
  if (!queue) return;
  await queue.add("reconcile", { paymentId: "" }, { repeat: { pattern: "*/10 * * * *" }, jobId: "reconcile", removeOnComplete: 10 });
}
