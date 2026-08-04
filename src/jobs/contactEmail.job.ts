import { Queue, Worker } from "bullmq";
import nodemailer from "nodemailer";
import Redis from "ioredis";
import { env } from "../config/env";
import type { CreateContactMessageDTO } from "../interfaces/contact.interface";

const QUEUE_NAME = "contact-email";

const connection = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : undefined;

const contactEmailQueue = connection ? new Queue<CreateContactMessageDTO>(QUEUE_NAME, { connection }) : undefined;

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

async function processContactEmail(data: CreateContactMessageDTO): Promise<void> {
  if (!transporter) {
    console.log(`[contact-email:stub] from=${data.email} subject=${data.subject}`);
    return;
  }

  const sender = env.GMAIL_APP_NAME ? `${env.GMAIL_APP_NAME} <${env.GMAIL_APP_MAIL}>` : env.GMAIL_APP_MAIL;

  await transporter.sendMail({
    from: sender,
    to: env.GMAIL_APP_MAIL,
    replyTo: data.email,
    subject: `[Contato] ${data.subject}`,
    text: `Nome: ${data.name}\nEmail: ${data.email}\nTelefone/Whatsapp: ${data.phone}\n\n${data.message}`,
  });
}

if (connection) {
  new Worker<CreateContactMessageDTO>(
    QUEUE_NAME,
    async (job) => {
      await processContactEmail(job.data);
    },
    { connection },
  );
}

export async function enqueueContactEmail(data: CreateContactMessageDTO): Promise<void> {
  if (contactEmailQueue) {
    await contactEmailQueue.add("send", data);
    return;
  }

  await processContactEmail(data);
}
