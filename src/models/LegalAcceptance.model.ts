import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { LEGAL_ACCEPTANCE_ACTIONS, LEGAL_DOCUMENT_TYPES } from "../interfaces/legal.interface";
import { makeInsertOnly } from "../helpers/immutable.helper";

// Evidência de aceite/revogação de documentos legais. Somente inserção: o estado vigente é o
// registro mais recente para (usuário ou igreja, tipo, titular). Uma revogação é um novo
// registro com action "revoke", nunca uma edição do aceite original.
const legalAcceptanceSchema = new Schema(
  {
    action: { type: String, enum: LEGAL_ACCEPTANCE_ACTIONS, required: true, default: "accept" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true },
    // Titular dos dados quando um responsável aceita em nome de um filho menor.
    onBehalfOfUserId: { type: Schema.Types.ObjectId, ref: "User" },
    documentId: { type: Schema.Types.ObjectId, ref: "LegalDocument", required: true },
    documentType: { type: String, enum: LEGAL_DOCUMENT_TYPES, required: true },
    version: { type: Number, required: true },
    contentHash: { type: String, required: true },
    // SHA-256 do texto exatamente como foi exibido (com o nome da igreja preenchido).
    renderedHash: { type: String, required: true },
    // Representante legal — só para documentos de escopo "church" que exigem assinatura.
    signer: {
      type: {
        name: { type: String, required: true },
        cpf: { type: String, required: true },
        role: { type: String, required: true },
        cnpj: { type: String, required: true },
      },
      _id: false,
      default: undefined,
    },
    ip: { type: String },
    forwardedFor: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

legalAcceptanceSchema.index({ userId: 1, documentType: 1, onBehalfOfUserId: 1, createdAt: -1 });
legalAcceptanceSchema.index({ churchId: 1, documentType: 1, createdAt: -1 });

makeInsertOnly(legalAcceptanceSchema, "Registro de aceite");

export type LegalAcceptanceDocument = InferSchemaType<typeof legalAcceptanceSchema> & { _id: Types.ObjectId };

export const LegalAcceptance = model("LegalAcceptance", legalAcceptanceSchema);
