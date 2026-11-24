import { Schema, model, Types, type InferSchemaType } from "mongoose";

export const INVOICE_KINDS = ["monthly", "setup"] as const;
export const INVOICE_STATUSES = ["pending", "paid", "overdue", "refunded", "canceled"] as const;

// Faturas da PhantterAI para a igreja (mensalidade e implantação), cobradas na conta Mercado Pago
// da PhantterAI (PIX ou cartão). Nada aqui tem a ver com as ofertas dos membros, que vão para a
// conta Mercado Pago de cada igreja.
const billingInvoiceSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    kind: { type: String, enum: INVOICE_KINDS, required: true },
    provider: { type: String, enum: ["mercadopago"], default: "mercadopago" },
    method: { type: String, enum: ["pix", "card"], default: "pix" },
    providerPaymentId: { type: String, required: true, unique: true },
    value: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: "pending" },
    providerStatus: { type: String },
    // PIX da fatura (enquanto em aberto) e página de pagamento do Mercado Pago (ticket_url).
    pixCopyPaste: { type: String },
    pixQrCodeBase64: { type: String },
    expiresAt: { type: Date },
    invoiceUrl: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

billingInvoiceSchema.index({ churchId: 1, dueDate: -1 });

export type BillingInvoiceDocument = InferSchemaType<typeof billingInvoiceSchema> & { _id: Types.ObjectId };

export const BillingInvoice = model("BillingInvoice", billingInvoiceSchema);
