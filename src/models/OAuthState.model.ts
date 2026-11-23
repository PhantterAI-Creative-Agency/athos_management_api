import { Schema, model } from "mongoose";

// Tentativa de conexão OAuth em andamento. `state` é aleatório e de uso único; expira em 10
// minutos (mesmo prazo do código de autorização do Mercado Pago). O code_verifier do PKCE fica
// criptografado e nunca sai do servidor.
const oauthStateSchema = new Schema(
  {
    state: { type: String, required: true, unique: true },
    provider: { type: String, enum: ["mercadopago"], required: true },
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    codeVerifierEnc: { type: String },
    usedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthState = model("OAuthState", oauthStateSchema);
