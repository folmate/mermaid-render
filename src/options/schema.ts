import { z } from "zod";
import { LIMITS } from "./defaults.js";

/**
 * Validates a CSS color string: hex, rgb/rgba, hsl/hsla, named, or "transparent"/"white".
 * Rejects obviously invalid strings without trying to exhaustively parse CSS.
 */
const cssColorSchema = z
  .string()
  .refine(
    (val) => {
      if (val === "transparent" || val === "white") return true;
      if (/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(val)) return true;
      if (/^rgba?\(\s*\d+/.test(val)) return true;
      if (/^hsla?\(\s*\d+/.test(val)) return true;
      // named CSS colors: a-z only, 3+ chars
      if (/^[a-zA-Z]{3,}$/.test(val)) return true;
      return false;
    },
    { message: "Invalid CSS color" },
  )
  .describe("CSS color string");

export const renderOptionsSchema = z
  .object({
    code: z
      .string()
      .min(1, "code must not be empty")
      .refine((v) => new TextEncoder().encode(v).length <= LIMITS.MAX_CODE_BYTES, {
        message: `code must be at most ${LIMITS.MAX_CODE_BYTES} bytes`,
      }),
    theme: z.enum(["default", "dark", "forest", "neutral"]).optional(),
    background: cssColorSchema.optional(),
    scale: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    width: z.number().min(LIMITS.MIN_DIMENSION).max(LIMITS.MAX_DIMENSION).nullable().optional(),
    height: z.number().min(LIMITS.MIN_DIMENSION).max(LIMITS.MAX_DIMENSION).nullable().optional(),
    fit: z.enum(["content", "fixed"]).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type RenderOptions = z.infer<typeof renderOptionsSchema>;
