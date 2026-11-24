import { Schema, model, Types, type InferSchemaType } from "mongoose";

export const INVOICE_KINDS = ["monthly", "setup"] as const;
export const INVOICE_STATUSES = ["pending", "paid", "overdue", "refunded", "canceled"] as const;

// Faturas da plataforma para a igreja (mensalidade e implantação), cobradas na conta da Athos
// pelo Asaas. Nada aqui tem a ver com as ofertas dos membros (essas vão para a conta da igreja).
const billingInvoiceSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    kind: { type: String, enum: INVOICE_KINDS, required: true },
    provider: { type: String, enum: ["asaas"], default: "asaas" },
    providerPaymentId: { type: String, required: true, unique: true },
    value: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: "pending" },
    providerStatus: { type: String },
    invoiceUrl: { type: String },
    bankSlipUrl: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

billingInvoiceSchema.index({ churchId: 1, dueDate: -1 });

export type BillingInvoiceDocument = InferSchemaType<typeof billingInvoiceSchema> & { _id: Types.ObjectId };

export const BillingInvoice = model("BillingInvoice", billingInvoiceSchema);
