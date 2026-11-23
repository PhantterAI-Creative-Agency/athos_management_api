import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { LEGAL_DOCUMENT_TYPES } from "../interfaces/legal.interface";
import { makeInsertOnly } from "../helpers/immutable.helper";

// Modelos de documentos jurídicos da plataforma (Termos, Política, Contrato, DPA...), globais
// para todas as igrejas. `content` é markdown com placeholders ({{churchName}} etc.)
// preenchidos na leitura. Cada publicação é uma nova versão; versões nunca são editadas.
const legalDocumentSchema = new Schema(
  {
    type: { type: String, enum: LEGAL_DOCUMENT_TYPES, required: true },
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true },
    content: { type: String, required: true },
    contentHash: { type: String, required: true },
    // false = correção menor; quem aceitou uma versão anterior não precisa aceitar de novo.
    requiresReacceptance: { type: Boolean, required: true, default: true },
    publishedAt: { type: Date, required: true, default: () => new Date() },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

legalDocumentSchema.index({ type: 1, version: -1 }, { unique: true });
legalDocumentSchema.index({ type: 1, publishedAt: -1 });

makeInsertOnly(legalDocumentSchema, "Documento legal publicado");

export type LegalDocumentDocument = InferSchemaType<typeof legalDocumentSchema> & { _id: Types.ObjectId };

export const LegalDocument = model("LegalDocument", legalDocumentSchema);
