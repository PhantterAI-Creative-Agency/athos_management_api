import { Schema, model, Types, type InferSchemaType } from "mongoose";

export const PAYMENT_ACCOUNT_STATUSES = ["connected", "needs_reconnect", "disconnected"] as const;

// Conta de recebimento da igreja no Mercado Pago, conectada por OAuth. O dinheiro das ofertas cai
// direto nessa conta (decisão D2 da URS). Tokens sempre criptografados (helpers/crypto.helper).
const paymentAccountSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, unique: true },
    provider: { type: String, enum: ["mercadopago"], required: true, default: "mercadopago" },
    status: { type: String, enum: PAYMENT_ACCOUNT_STATUSES, required: true, default: "connected" },
    mpUserId: { type: String },
    accessTokenEnc: { type: String, select: false },
    refreshTokenEnc: { type: String, select: false },
    publicKey: { type: String },
    scope: { type: String },
    liveMode: { type: Boolean },
    expiresAt: { type: Date, index: true },
    connectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    connectedAt: { type: Date },
    lastRefreshedAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true },
);

export type PaymentAccountDocument = InferSchemaType<typeof paymentAccountSchema> & { _id: Types.ObjectId };

export const PaymentAccount = model("PaymentAccount", paymentAccountSchema);
