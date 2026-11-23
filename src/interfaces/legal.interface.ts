import { z } from "zod";
import type { Role } from "../helpers/jwt.helper";

export const LEGAL_DOCUMENT_TYPES = [
  "terms",
  "privacy",
  "saas_contract",
  "dpa",
  "radio_liability",
  "sensitive_data_consent",
] as const;

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export const LEGAL_ACCEPTANCE_ACTIONS = ["accept", "revoke"] as const;
export type LegalAcceptanceAction = (typeof LEGAL_ACCEPTANCE_ACTIONS)[number];

export interface LegalDocumentRule {
  /** "user": cada usuário aceita por si. "church": um aceite vale para a igreja inteira. */
  scope: "user" | "church";
  /** Bloqueia o uso até o aceite (aparece em GET /legal/pending). */
  requiredOnAccess: boolean;
  /** Exige os dados do representante legal (nome, CPF, cargo, CNPJ). */
  requiresSigner: boolean;
  /** Permite aceitar em nome de um filho menor (responsável legal). */
  allowOnBehalfOf: boolean;
  /** Pode ser revogado pelo próprio titular/igreja. */
  revocable: boolean;
}

export const LEGAL_DOCUMENT_RULES: Record<LegalDocumentType, LegalDocumentRule> = {
  terms: { scope: "user", requiredOnAccess: true, requiresSigner: false, allowOnBehalfOf: false, revocable: false },
  privacy: { scope: "user", requiredOnAccess: true, requiresSigner: false, allowOnBehalfOf: false, revocable: false },
  saas_contract: {
    scope: "church",
    requiredOnAccess: true,
    requiresSigner: true,
    allowOnBehalfOf: false,
    revocable: false,
  },
  dpa: { scope: "church", requiredOnAccess: true, requiresSigner: true, allowOnBehalfOf: false, revocable: false },
  radio_liability: {
    scope: "church",
    requiredOnAccess: false,
    requiresSigner: false,
    allowOnBehalfOf: false,
    revocable: true,
  },
  sensitive_data_consent: {
    scope: "user",
    requiredOnAccess: false,
    requiresSigner: false,
    allowOnBehalfOf: true,
    revocable: true,
  },
};

/** Papéis que podem aceitar documentos de escopo "church" em nome da igreja. */
export const CHURCH_SCOPE_ROLES: Role[] = ["admin"];

export const legalTypeParamSchema = z.object({
  type: z.enum(LEGAL_DOCUMENT_TYPES, { message: "Tipo de documento inválido" }),
});

export const getCurrentLegalDocumentQuerySchema = z.object({
  churchSlug: z.string().min(1).optional(),
});

export type GetCurrentLegalDocumentQueryDTO = z.infer<typeof getCurrentLegalDocumentQuerySchema>;

export const publishLegalDocumentSchema = z.object({
  type: z.enum(LEGAL_DOCUMENT_TYPES, { message: "Tipo de documento inválido" }),
  title: z.string().min(1, "Título é obrigatório").max(200),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  requiresReacceptance: z.boolean().default(true),
  publishedAt: z.coerce.date().optional(),
});

export type PublishLegalDocumentDTO = z.infer<typeof publishLegalDocumentSchema>;

export const listLegalDocumentsQuerySchema = z.object({
  type: z.enum(LEGAL_DOCUMENT_TYPES).optional(),
});

export type ListLegalDocumentsQueryDTO = z.infer<typeof listLegalDocumentsQuerySchema>;

const signerSchema = z.object({
  name: z.string().trim().min(3, "Nome do representante legal é obrigatório").max(200),
  cpf: z.string().min(11, "CPF inválido"),
  role: z.string().trim().min(2, "Cargo do representante legal é obrigatório").max(100),
  cnpj: z.string().min(14, "CNPJ inválido"),
});

export const acceptLegalDocumentSchema = z.object({
  version: z.number().int().positive("Versão inválida"),
  contentHash: z.string().length(64, "Hash do conteúdo inválido"),
  signer: signerSchema.optional(),
  onBehalfOfUserId: z.string().min(1).optional(),
});

export type AcceptLegalDocumentDTO = z.infer<typeof acceptLegalDocumentSchema>;

export const revokeLegalDocumentSchema = z.object({
  onBehalfOfUserId: z.string().min(1).optional(),
});

export type RevokeLegalDocumentDTO = z.infer<typeof revokeLegalDocumentSchema>;

export interface LegalDocumentDTO {
  id: string;
  type: LegalDocumentType;
  version: number;
  title: string;
  /** Texto com os placeholders já preenchidos (ex.: nome da igreja). */
  content: string;
  /** SHA-256 do modelo (sem placeholders preenchidos); o cliente devolve no aceite. */
  contentHash: string;
  requiresReacceptance: boolean;
  publishedAt: string;
}

export interface LegalAcceptanceDTO {
  id: string;
  type: LegalDocumentType;
  action: LegalAcceptanceAction;
  version: number;
  userId: string;
  churchId: string;
  onBehalfOfUserId?: string;
  signer?: { name: string; cpf: string; role: string; cnpj: string };
  createdAt: string;
}

export type PendingReason = "never_accepted" | "new_version" | "revoked";

export interface PendingLegalDocumentDTO {
  type: LegalDocumentType;
  title: string;
  version: number;
  contentHash: string;
  scope: LegalDocumentRule["scope"];
  requiresSigner: boolean;
  reason: PendingReason;
}

export interface RequestEvidence {
  ip?: string;
  forwardedFor?: string;
  userAgent?: string;
}
