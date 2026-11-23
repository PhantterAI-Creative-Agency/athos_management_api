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

/** Estado efetivo de cada recurso. "ads" é lido de `settings.adsEnabled` (campo legado). */
export function resolveFeatures(settings?: SettingsWithFeatures | null): Record<ChurchFeature, boolean> {
  const features = settings?.features ?? {};
  return {
    radio: features.radio ?? FEATURE_DEFAULTS.radio,
    ads: settings?.adsEnabled ?? FEATURE_DEFAULTS.ads,
    aiAssistant: features.aiAssistant ?? FEATURE_DEFAULTS.aiAssistant,
    onlineOfferings: features.onlineOfferings ?? FEATURE_DEFAULTS.onlineOfferings,
  };
}

/** Caminho no documento Church onde o recurso é gravado. */
export function featureSettingsPath(feature: ChurchFeature): string {
  return feature === "ads" ? "settings.adsEnabled" : `settings.features.${feature}`;
}
