import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";
import { Notification } from "../models/Notification.model";
import { DeviceToken } from "../models/DeviceToken.model";
import type { CreateNotificationInput } from "../interfaces/notification.interface";

const QUEUE_NAME = "push-notification";

const connection = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : undefined;

const pushNotificationQueue = connection ? new Queue<CreateNotificationInput>(QUEUE_NAME, { connection }) : undefined;

// Stub: sem credenciais reais de FCM/APNs/Expo Push Service em config/env.ts ainda, o envio
// apenas registra a Notification (histórico/in-app) e loga os DeviceTokens que receberiam o
// push, sem chamar nenhum provedor externo. Troque pela chamada real ao SDK (FCM Admin SDK,
// node-apn, expo-server-sdk) quando as credenciais existirem — o restante do fluxo (registro
// de Notification, listagem, leitura) já está pronto para receber o envio real sem mudança
// de contrato.
async function processPushNotification(data: CreateNotificationInput): Promise<void> {
  const notification = await Notification.create({
    userId: data.userId,
    type: data.type,
    title: data.title,
    body: data.body,
  });

  const deviceTokens = await DeviceToken.find({ userId: data.userId });

  for (const deviceToken of deviceTokens) {
    console.log(
      `[push:stub] platform=${deviceToken.platform} token=${deviceToken.token} notificationId=${notification._id}`,
    );
  }
}

if (connection) {
  new Worker<CreateNotificationInput>(
    QUEUE_NAME,
    async (job) => {
      await processPushNotification(job.data);
    },
    { connection },
  );
}

// Sem REDIS_URL configurado (ex.: ambiente local/test), processa o envio inline em vez de
// enfileirar — mesma degradação graciosa usada em jobs/paymentWebhook.job.ts.
export async function enqueuePushNotification(data: CreateNotificationInput): Promise<void> {
  if (pushNotificationQueue) {
    await pushNotificationQueue.add("send", data);
    return;
  }

  await processPushNotification(data);
}
