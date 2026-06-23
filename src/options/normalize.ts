import { renderOptionsSchema, type RenderOptions } from "./schema.js";
import { DEFAULTS } from "./defaults.js";
import { ValidationError } from "./errors.js";

export interface NormalizedRender {
  code: string;
  mermaidConfig: Record<string, unknown>;
  renderParams: {
    background: string;
    scale: 1 | 2 | 3;
    width: number | null;
    height: number | null;
    fit: "content" | "fixed";
  };
}

/**
 * Validates raw input, applies defaults, and builds the effective Mermaid config.
 *
 * @param input - Raw unknown input to validate and normalize.
 * @returns NormalizedRender with merged mermaidConfig and renderParams.
 * @throws ValidationError when input fails the schema or cross-field rules.
 */
export function normalize(input: unknown): NormalizedRender {
  const result = renderOptionsSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => i.message).join("; "));
  }

  const opts: RenderOptions = result.data;

  const fit = opts.fit ?? DEFAULTS.fit;
  if (fit === "fixed" && opts.width == null && opts.height == null) {
    throw new ValidationError('fit "fixed" requires at least one of width or height');
  }

  // Config merge: start from deep clone of user passthrough, then apply convenience opts
  const mermaidConfig: Record<string, unknown> = structuredClone(opts.config ?? {});
  mermaidConfig["theme"] = opts.theme ?? DEFAULTS.theme;
  mermaidConfig["securityLevel"] = "strict";
  mermaidConfig["startOnLoad"] = false;

  return {
    code: opts.code,
    mermaidConfig,
    renderParams: {
      background: opts.background ?? DEFAULTS.background,
      scale: opts.scale ?? DEFAULTS.scale,
      width: opts.width ?? DEFAULTS.width,
      height: opts.height ?? DEFAULTS.height,
      fit,
    },
  };
}
