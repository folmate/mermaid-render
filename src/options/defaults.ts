/** Pinned exact version of the bundled Mermaid library. */
export const MERMAID_VERSION: string = "11.15.0";

export const DEFAULTS = {
  theme: "default",
  background: "white",
  scale: 2,
  width: null,
  height: null,
  fit: "content",
} as const;

export const LIMITS = {
  MAX_CODE_BYTES: 50_000,
  MIN_DIMENSION: 1,
  MAX_DIMENSION: 10_000,
  ALLOWED_SCALES: [1, 2, 3] as const,
} as const;
