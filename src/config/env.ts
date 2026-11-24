import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const ENV_FILES: Record<string, string> = {
  local: ".env.local",
  qa: ".env.qa",
  production: ".env.prod",
};

const appEnv = process.env.APP_ENV ?? "local";
dotenv.config({ path: path.resolve(process.cwd(), ENV_FILES[appEnv] ?? ENV_FILES.local) });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  MONGODB_URI: z.string().min(1, "MONGODB_URI é obrigatório"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET é obrigatório"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET é obrigatório"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  CORS_ORIGINS: z.string().default(""),
  REDIS_URL: z.string().optional(),
  BIBLE_API_BASE_URL: z.string().default("https://www.abibliadigital.com.br/api"),
  BIBLE_API_TOKEN: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("deepseek/deepseek-chat"),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  GMAIL_APP_NAME: z.string().optional(),
  GMAIL_APP_MAIL: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  // E-mails (separados por vírgula) do grupo que administra o site e recebe avisos de novos cadastros.
  REGISTRATION_NOTIFY_EMAILS: z.string().default(""),
  // Pasta onde ficam os arquivos enviados (áudios da rádio). Na Hostinger, use um caminho fora da pasta do deploy.
  UPLOAD_DIR: z.string().default(path.resolve(process.cwd(), "uploads")),
  RADIO_MAX_UPLOAD_MB: z.coerce.number().positive().default(100),
  // Limite padrão de armazenamento (áudios) por igreja, em MB. Ajustável por igreja no painel da plataforma.
  CHURCH_STORAGE_LIMIT_MB: z.coerce.number().positive().default(2048),
  // Planos e cobrança das igrejas (Sprint 8). Valores em reais.
  PLAN_ESSENCIAL_PRICE: z.coerce.number().positive().default(97),
  PLAN_COMPLETO_PRICE: z.coerce.number().positive().default(197),
  TRIAL_DAYS: z.coerce.number().int().nonnegative().default(30),
  BILLING_GRACE_DAYS: z.coerce.number().int().nonnegative().default(15),
  // Mensalidades das igrejas: cobradas na conta Mercado Pago da PhantterAI (PIX mensal ou
  // assinatura no cartão). Access token de produção da conta da PhantterAI.
  MP_PLATFORM_ACCESS_TOKEN: z.string().optional(),
  // Quantos dias antes do vencimento a fatura PIX é gerada.
  BILLING_INVOICE_DAYS_BEFORE: z.coerce.number().int().min(0).max(25).default(5),
  // URL pública das notificações das mensalidades; padrão: derivada de MP_REDIRECT_URI.
  MP_BILLING_NOTIFICATION_URL: z.string().optional(),
  // Segredo exigido no cabeçalho X-Webhook-Secret do webhook de pagamentos. Sem ele, o webhook
  // fica desligado (404). Na Sprint 5 é substituído pela assinatura do Mercado Pago.
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  // "true" liga as cobranças simuladas (QR Code falso). Use só em desenvolvimento; nos testes
  // automatizados já fica ligado.
  PAYMENTS_MOCK_ENABLED: z.enum(["true", "false"]).optional(),
  // Mercado Pago — aplicação da Athos (OAuth). Cada igreja conecta a PRÓPRIA conta; estes
  // dados só identificam a plataforma. MP_REDIRECT_URI deve ser idêntica à cadastrada no app
  // do Mercado Pago (ex.: https://api.seudominio/athos_adm/api/payments/mercadopago/callback).
  MP_CLIENT_ID: z.string().optional(),
  MP_CLIENT_SECRET: z.string().optional(),
  MP_REDIRECT_URI: z.string().optional(),
  // "true" (padrão) envia PKCE (S256). Exige ativar PKCE em "Detalhes da aplicação" no Mercado Pago.
  MP_USE_PKCE: z.enum(["true", "false"]).default("true"),
  // Chave secreta de webhooks da aplicação (painel do Mercado Pago → Webhooks). Valida x-signature.
  MP_WEBHOOK_SECRET: z.string().optional(),
  // URL pública do webhook; padrão: derivada de MP_REDIRECT_URI (troca /callback por /webhook).
  MP_NOTIFICATION_URL: z.string().optional(),
  MP_AUTH_BASE_URL: z.string().default("https://auth.mercadopago.com"),
  MP_API_BASE_URL: z.string().default("https://api.mercadopago.com"),
  // URL do site (painel), para voltar após autorizar no Mercado Pago. Ex.: https://suaigreja.org
  ADMIN_PANEL_URL: z.string().optional(),
  // Chave de 32 bytes (base64 ou hex) para criptografar tokens de terceiros. Gere com:
  // node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  // Segredo das rotas internas de cron (Authorization: Bearer <CRON_SECRET>).
  CRON_SECRET: z.string().optional(),
  // Dados do fornecedor exibidos nos documentos legais (Termos, Política, Contrato, DPA).
  LEGAL_PROVIDER_NAME: z.string().default("[RAZÃO SOCIAL DO FORNECEDOR]"),
  LEGAL_PROVIDER_DOCUMENT: z.string().default("[CPF/CNPJ DO FORNECEDOR]"),
  LEGAL_PROVIDER_EMAIL: z.string().default("[E-MAIL DO FORNECEDOR]"),
  LEGAL_FORUM_CITY: z.string().default("[CIDADE/UF DO FORO]"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Variáveis de ambiente inválidas: ${parsed.error.message}`);
}

export const env = parsed.data;
