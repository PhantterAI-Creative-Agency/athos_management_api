import { Queue, Worker } from "bullmq";
import nodemailer from "nodemailer";
import Redis from "ioredis";
import { env } from "../config/env";

const QUEUE_NAME = "password-reset-email";

export interface PasswordResetEmailData {
  to: string;
  name: string;
  code: string;
  expiresInMinutes: number;
}

const connection = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : undefined;

const passwordResetEmailQueue = connection
  ? new Queue<PasswordResetEmailData>(QUEUE_NAME, { connection })
  : undefined;

const transporter =
  env.GMAIL_APP_MAIL && env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: env.GMAIL_APP_MAIL,
          pass: env.GMAIL_APP_PASSWORD,
        },
      })
    : undefined;

async function processPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
  if (!transporter) {
    console.log(`[password-reset-email:stub] to=${data.to}`);
    return;
  }

  const sender = env.GMAIL_APP_NAME ? `${env.GMAIL_APP_NAME} <${env.GMAIL_APP_MAIL}>` : env.GMAIL_APP_MAIL;

  await transporter.sendMail({
    from: sender,
    to: data.to,
    subject: "Código para redefinir sua senha",
    text: `Olá, ${data.name}!\n\nSeu código para redefinir a senha é: ${data.code}\n\nEle expira em ${data.expiresInMinutes} minutos. Se você não solicitou, ignore este e-mail.`,
  });
}

if (connection) {
  new Worker<PasswordResetEmailData>(
    QUEUE_NAME,
    async (job) => {
      await processPasswordResetEmail(job.data);
    },
    { connection },
  );
}

export async function enqueuePasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
  if (passwordResetEmailQueue) {
    // O código vai em texto claro no job; remove-o do Redis assim que concluído/falho.
    await passwordResetEmailQueue.add("send", data, { removeOnComplete: true, removeOnFail: true });
    return;
  }

  await processPasswordResetEmail(data);
}
