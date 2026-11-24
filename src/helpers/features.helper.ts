import { getBillingState, planAllows, type StoredSubscription } from "./plans.helper";
export const CHURCH_FEATURES = ["radio", "ads", "aiAssistant", "onlineOfferings"] as const;

export type ChurchFeature = (typeof CHURCH_FEATURES)[number];

export interface ChurchFeatureSettings {
  radio?: boolean | null;
  aiAssistant?: boolean | null;
  onlineOfferings?: boolean | null;
}

// Valor quando a igreja ainda não tem o campo gravado (documentos anteriores às flags).
// A rádio vem desligada: só é ativada após o aceite de responsabilidade (URS-RAD-01).
export const FEATURE_DEFAULTS: Record<ChurchFeature, boolean> = {
  radio: false,
  ads: true,
  aiAssistant: true,
  onlineOfferings: true,
};

interface SettingsWithFeatures {
  adsEnabled?: boolean | null;
  features?: ChurchFeatureSettings | null;
}

/**
 * Estado efetivo de cada recurso: ligado nas configurações **e** incluído no plano da igreja
 * (Sprint 8). "ads" é lido de `settings.adsEnabled` (campo legado). Sem assinatura gravada, a
 * igreja é tratada como plano Completo (igrejas anteriores à cobrança).
 */
export function resolveFeatures(
  settings?: SettingsWithFeatures | null,
  subscription?: StoredSubscription | null,
): Record<ChurchFeature, boolean> {
  const features = settings?.features ?? {};
  const plan = getBillingState(subscription).plan;
  const raw: Record<ChurchFeature, boolean> = {
    radio: features.radio ?? FEATURE_DEFAULTS.radio,
    ads: settings?.adsEnabled ?? FEATURE_DEFAULTS.ads,
    aiAssistant: features.aiAssistant ?? FEATURE_DEFAULTS.aiAssistant,
    onlineOfferings: features.onlineOfferings ?? FEATURE_DEFAULTS.onlineOfferings,
  };
  return Object.fromEntries(
    CHURCH_FEATURES.map((feature) => [feature, raw[feature] && planAllows(plan, feature)]),
  ) as Record<ChurchFeature, boolean>;
}

/** Caminho no documento Church onde o recurso é gravado. */
export function featureSettingsPath(feature: ChurchFeature): string {
  return feature === "ads" ? "settings.adsEnabled" : `settings.features.${feature}`;
}
