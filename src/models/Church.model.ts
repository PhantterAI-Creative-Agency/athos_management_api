import { Schema, model, type InferSchemaType } from "mongoose";

const churchSchema = new Schema(
  {
    name: { type: String, required: true },
    logoUrl: { type: String, required: true },
    address: { type: String },
    addressDetails: {
      cep: { type: String },
      street: { type: String },
      number: { type: String },
      complement: { type: String },
      neighborhood: { type: String },
      city: { type: String },
      state: { type: String },
    },
    phone: { type: String },
    about: { type: String },
    slug: { type: String, required: true, unique: true },
    // Domínios/subdomínios do site da igreja (sem "www."), para resolver a igreja pelo endereço.
    domains: { type: [String], default: [] },
    // Plano e assinatura da igreja (Sprint 8). Sem `plan`: igreja anterior à cobrança, tratada como
    // Completo e isenta (helpers/plans.helper.ts → getBillingState).
    subscription: {
      plan: { type: String, enum: ["essencial", "completo"] },
      status: { type: String, enum: ["trial", "active", "past_due", "canceled"] },
      exempt: { type: Boolean },
      trialEndsAt: { type: Date },
      currentPeriodEnd: { type: Date },
      graceUntil: { type: Date },
      billingType: { type: String, enum: ["UNDEFINED", "BOLETO", "PIX"] },
      asaasCustomerId: { type: String },
      asaasSubscriptionId: { type: String, index: true },
      canceledAt: { type: Date },
      lastNotice: { type: String },
    },
    // Limites por igreja (Sprint 7). Sem valor, vale o padrão da plataforma.
    limits: {
      storageMb: { type: Number },
    },
    settings: {
      primaryColor: { type: String, required: true, default: "#000000" },
      growthGroupName: { type: String, required: true, default: "Grupos de Crescimento" },
      growthGroupAcronym: { type: String, required: true, default: "GC" },
      youtubeChannelId: { type: String },
      adsEnabled: { type: Boolean, required: true, default: true },
      disabledAdPlacements: { type: [String], required: true, default: [] },
      // Recursos ligados/desligados por igreja (ver helpers/features.helper.ts). "ads" continua
      // em `adsEnabled` acima, por compatibilidade com os clientes atuais.
      // Identidade visual do site (Sprint 7). Cores em hex; fonte de uma lista fechada.
      theme: {
        accentColor: { type: String },
        secondaryColor: { type: String },
        fontFamily: { type: String },
        faviconUrl: { type: String },
        heroImageUrl: { type: String },
        homeSections: { type: [{ id: String, visible: Boolean, _id: false }], default: undefined },
      },
      features: {
        radio: { type: Boolean, default: false },
        aiAssistant: { type: Boolean, default: true },
        onlineOfferings: { type: Boolean, default: true },
      },
    },
    homeContent: {
      intro: { type: String },
      mission: { type: String },
      vision: { type: String },
      values: { type: String },
      bannerEventId: { type: Schema.Types.ObjectId, ref: "Event" },
    },
    contact: {
      email: { type: String },
      whatsapp: { type: String },
      phone: { type: String },
      socialLinks: [
        {
          platform: { type: String, required: true },
          url: { type: String, required: true },
          _id: false,
        },
      ],
    },
    socialLinks: {
      facebook: { type: String },
      instagram: { type: String },
      youtube: { type: String },
    },
    footerWidgets: {
      type: [
        {
          title: { type: String, default: "" },
          items: [
            {
              type: { type: String, enum: ["text", "link", "image"], required: true },
              text: { type: String },
              url: { type: String },
              imageUrl: { type: String },
              icon: { type: String },
              _id: false,
            },
          ],
          _id: false,
        },
      ],
      default: undefined,
    },
    // Chave PIX da própria igreja, exibida para ofertas enquanto não há integração com o
    // Mercado Pago (Sprint 3 do plano). O dinheiro cai direto na conta dona da chave.
    pix: {
      type: {
        keyType: { type: String, enum: ["cpf", "cnpj", "email", "phone", "random"], required: true },
        key: { type: String, required: true },
        receiverName: { type: String, required: true },
        city: { type: String, required: true },
      },
      _id: false,
      default: undefined,
    },
    serviceSchedule: [
      {
        day: { type: String, required: true },
        time: { type: String, required: true },
        theme: { type: String, required: true },
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

churchSchema.index({ domains: 1 }, { unique: true, partialFilterExpression: { "domains.0": { $exists: true } } });

export type ChurchDocument = InferSchemaType<typeof churchSchema>;

export const Church = model("Church", churchSchema);
