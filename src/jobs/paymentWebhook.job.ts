import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";
import { processPaymentWebhook } from "../services/offerings.service";
import { confirmEventRegistrationPayment } from "../services/eventRegistrations.service";
import type { PaymentWebhookDTO } from "../interfaces/offering.interface";

const QUEUE_NAME = "payment-webhook";

const connection = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : undefined;

const paymentWebhookQueue = connection ? new Queue<PaymentWebhookDTO>(QUEUE_NAME, { connection }) : undefined;

async function handlePaymentWebhook(data: PaymentWebhookDTO): Promise<void> {
  const offering = await processPaymentWebhook(data);

  if (offering && offering.type === "event_registration" && offering.status === "paid") {
    await confirmEventRegistrationPayment(offering.id);
  }
}

if (connection) {
  new Worker<PaymentWebhookDTO>(
    QUEUE_NAME,
    async (job) => {
      await handlePaymentWebhook(job.data);
    },
    { connection },
  );
}

// Sem REDIS_URL configurado (ex.: ambiente local/test), processa o evento inline em vez de
// enfileirar — mesma degradação graciosa usada em middlewares/rateLimiter.ts. Com Redis
// disponível, o processamento vira assíncrono via BullMQ (tolerância a picos/reprocessamento),
// conforme TDD_api.md §8.
export async function enqueuePaymentWebhook(data: PaymentWebhookDTO): Promise<void> {
  if (paymentWebhookQueue) {
    await paymentWebhookQueue.add("process", data);
    return;
  }

  await handlePaymentWebhook(data);
}
