/**
 * Single source of truth for the color-theme catalog.
 *
 * The CSS variables themselves live in `src/app/globals.css` under
 * `html[data-theme="..."]` blocks — that file is the one we paste
 * theme tokens into. This module only carries the metadata the UI
 * (settings picker, no-flash boot script) needs.
 */

export const THEME_IDS = [
  "cobalt",
  "orange",
  "violet",
  "emerald",
  "amber",
  "rose",
] as const;

export type ThemeId = (typeof THEME_IDS)[number] | "ddm";

export const DEFAULT_THEME: ThemeId = "cobalt";

export const STORAGE_KEY = "wacrm.theme";

/**
 * MODE — the light/dark dimension, orthogonal to the accent theme.
 */
export const MODES = ["light", "dark"] as const;

export type Mode = (typeof MODES)[number];

export const DEFAULT_MODE: Mode = "dark";

export const MODE_STORAGE_KEY = "wacrm.mode";

export function isMode(value: unknown): value is Mode {
  return (
    typeof value === "string" && (MODES as ReadonlyArray<string>).includes(value)
  );
}

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  /**
   * Static swatch color for the picker chip.
   */
  swatch: string;
}

export const THEMES: ReadonlyArray<ThemeMeta> = [
  {
    id: "cobalt",
    name: "Cobalt",
    tagline: "Azul B2B-SaaS limpo — cor padrão do sistema.",
    swatch: "oklch(0.585 0.2 254)",
  },
  {
    id: "orange",
    name: "Orange",
    tagline: "Laranja vibrante, moderno e dinâmico.",
    swatch: "oklch(0.64 0.23 42)",
  },
  {
    id: "violet",
    name: "Violet",
    tagline: "Elegante e moderno com tom violeta.",
    swatch: "oklch(0.526 0.247 293)",
  },
  {
    id: "emerald",
    name: "Emerald",
    tagline: "Verde esmeralda para crescimento e agilidade.",
    swatch: "oklch(0.62 0.16 162)",
  },
  {
    id: "amber",
    name: "Amber",
    tagline: "Achechegante e amigável em tom âmbar.",
    swatch: "oklch(0.745 0.16 65)",
  },
  {
    id: "rose",
    name: "Rose",
    tagline: "Moderno e marcante em tom rosé.",
    swatch: "oklch(0.645 0.22 16)",
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    ((THEME_IDS as ReadonlyArray<string>).includes(value) || value === "ddm")
  );
}
