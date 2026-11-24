import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";
import { runBillingCycle } from "../services/billing.service";

const QUEUE_NAME = "billing-notices";

/** Ciclo diário das mensalidades (09:23) quando há Redis; sem Redis, use /internal/cron/billing-cycle. */
export async function scheduleBillingNotices(): Promise<void> {
  if (!env.REDIS_URL) return;
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.add("notices", {}, { repeat: { pattern: "23 9 * * *" }, jobId: "daily-notices", removeOnComplete: 10 });
  new Worker(QUEUE_NAME, async () => runBillingCycle(), { connection });
}
