export const THEME_FONTS = ["geist", "inter", "poppins", "montserrat", "lora", "merriweather"] as const;
export type ThemeFont = (typeof THEME_FONTS)[number];

/** Seções da home, na ordem padrão. */
export const HOME_SECTIONS = [
  "about",
  "welcome",
  "events",
  "media",
  "featured",
  "devotionals",
  "ministries",
  "contact",
] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

export interface ThemeSettings {
  accentColor?: string | null;
  secondaryColor?: string | null;
  fontFamily?: string | null;
  faviconUrl?: string | null;
  heroImageUrl?: string | null;
  homeSections?: ArrayLike<{ id?: string | null; visible?: boolean | null }> | null;
}

export interface ThemeDTO {
  accentColor?: string;
  secondaryColor?: string;
  fontFamily: ThemeFont;
  faviconUrl?: string;
  heroImageUrl?: string;
  homeSections: { id: HomeSection; visible: boolean }[];
}

/** Tema efetivo: completa a lista de seções (novas seções entram visíveis, no fim). */
export function resolveTheme(theme?: ThemeSettings | null): ThemeDTO {
  const saved = Array.from(theme?.homeSections ?? [])
    .filter((s) => (HOME_SECTIONS as readonly string[]).includes(s.id ?? ""))
    .map((s) => ({ id: s.id as HomeSection, visible: s.visible !== false }));
  const seen = new Set(saved.map((s) => s.id));
  const homeSections = [...saved, ...HOME_SECTIONS.filter((id) => !seen.has(id)).map((id) => ({ id, visible: true }))];
  return {
    accentColor: theme?.accentColor ?? undefined,
    secondaryColor: theme?.secondaryColor ?? undefined,
    fontFamily: (THEME_FONTS as readonly string[]).includes(theme?.fontFamily ?? "") ? (theme!.fontFamily as ThemeFont) : "geist",
    faviconUrl: theme?.faviconUrl ?? undefined,
    heroImageUrl: theme?.heroImageUrl ?? undefined,
    homeSections,
  };
}

/** Normaliza um domínio/host: minúsculas, sem esquema, porta, caminho ou "www.". */
export function normalizeHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}
