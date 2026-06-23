import { describe, it, expect } from "vitest";
import { normalize } from "./normalize.js";
import { ValidationError } from "./errors.js";
import { DEFAULTS } from "./defaults.js";

const VALID_CODE = "graph TD\n  A --> B";

describe("normalize()", () => {
  it("applies defaults for missing optional fields", () => {
    const result = normalize({ code: VALID_CODE });
    expect(result.renderParams.scale).toBe(DEFAULTS.scale);
    expect(result.renderParams.background).toBe(DEFAULTS.background);
    expect(result.renderParams.fit).toBe(DEFAULTS.fit);
    expect(result.renderParams.width).toBeNull();
    expect(result.renderParams.height).toBeNull();
  });

  it("folds theme into mermaidConfig", () => {
    const result = normalize({ code: VALID_CODE, theme: "dark" });
    expect(result.mermaidConfig["theme"]).toBe("dark");
  });

  it("uses default theme when none provided", () => {
    const result = normalize({ code: VALID_CODE });
    expect(result.mermaidConfig["theme"]).toBe(DEFAULTS.theme);
  });

  it("forces securityLevel: strict", () => {
    const result = normalize({ code: VALID_CODE, config: { securityLevel: "loose" } });
    expect(result.mermaidConfig["securityLevel"]).toBe("strict");
  });

  it("forces startOnLoad: false", () => {
    const result = normalize({ code: VALID_CODE, config: { startOnLoad: true } });
    expect(result.mermaidConfig["startOnLoad"]).toBe(false);
  });

  it("preserves other config passthrough values", () => {
    const result = normalize({ code: VALID_CODE, config: { flowchart: { curve: "basis" } } });
    expect(result.mermaidConfig["flowchart"]).toEqual({ curve: "basis" });
  });

  it("does not mutate the original config object", () => {
    const config = { myKey: "value" };
    normalize({ code: VALID_CODE, config });
    expect(config).toEqual({ myKey: "value" });
  });

  it('rejects fit "fixed" without width or height', () => {
    expect(() =>
      normalize({ code: VALID_CODE, fit: "fixed", width: null, height: null }),
    ).toThrowError(ValidationError);
  });

  it('accepts fit "fixed" with only width', () => {
    expect(() => normalize({ code: VALID_CODE, fit: "fixed", width: 800 })).not.toThrow();
  });

  it('accepts fit "fixed" with only height', () => {
    expect(() => normalize({ code: VALID_CODE, fit: "fixed", height: 600 })).not.toThrow();
  });

  it("rejects unknown top-level keys", () => {
    expect(() => normalize({ code: VALID_CODE, unknownField: "oops" })).toThrowError(
      ValidationError,
    );
  });

  it("rejects empty code", () => {
    expect(() => normalize({ code: "" })).toThrowError(ValidationError);
  });

  it("rejects missing code", () => {
    expect(() => normalize({})).toThrowError(ValidationError);
  });

  it("rejects code exceeding MAX_CODE_BYTES", () => {
    const big = "A".repeat(51_000);
    expect(() => normalize({ code: big })).toThrowError(ValidationError);
  });

  it("returns code unchanged", () => {
    const result = normalize({ code: VALID_CODE });
    expect(result.code).toBe(VALID_CODE);
  });

  it("background is in renderParams, not mermaidConfig", () => {
    const result = normalize({ code: VALID_CODE, background: "transparent" });
    expect(result.renderParams.background).toBe("transparent");
    expect(result.mermaidConfig["background"]).toBeUndefined();
  });
});
