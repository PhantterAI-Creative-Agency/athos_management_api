import { Schema, model } from "mongoose";

// Eventos do Asaas já processados. O Asaas entrega cada evento "pelo menos uma vez"; o id
// único evita processar o mesmo evento duas vezes. Apagados após 60 dias.
const billingWebhookEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    event: { type: String },
    paymentId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
billingWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 86_400 });

export const BillingWebhookEvent = model("BillingWebhookEvent", billingWebhookEventSchema);
