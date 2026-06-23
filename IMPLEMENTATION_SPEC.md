# Mermaid → Image (Static Site) — Implementation Specification

**Audience:** an autonomous coding agent implementing this project from scratch.
**Authority:** this document is the single source of truth. Where it is explicit,
follow it exactly. Where it is silent, choose the simplest, most conventional option
and note the choice in the PR description. Do not introduce frameworks, services, or
abstractions not listed here.

---

## 1. Goal & scope

Build a **single, 100% client-side static website** that renders **Mermaid diagram
source** into **SVG, PNG, and PDF**, with a live editor and download buttons. It is
deployed to GitHub Pages and does all rendering in the browser — there is no server,
no API, and no network access at render time.

### In scope (v1)
Everything in this document.

### Explicitly out of scope (v1) — do not build
- Any server, REST API, HTTP service, or Puppeteer/headless-browser code.
- Any CLI, Docker, or batch-rendering tooling.
- A monorepo / workspaces — this is **one** project.
- A UI framework (React/Vue/Svelte). Use vanilla TypeScript.
- Auth, persistence, analytics.

---

## 2. Toolchain & conventions

| Item | Requirement |
|------|-------------|
| Language | TypeScript, `"strict": true`, no implicit `any`. |
| Build tool | **Vite**. |
| Runtime (dev) | Node.js 20 LTS (≥ 20.11). |
| Package manager | pnpm (single project; no workspaces). |
| Module system | ESM. |
| Linting | ESLint + Prettier, default-recommended configs. |
| Dependency pinning | Pin **exact** versions (no `^`/`~`). |
| Mermaid version | Install the latest stable Mermaid release at build time, pin it exactly, and export it as `MERMAID_VERSION` from `src/options/defaults.ts`. Bundle Mermaid with the app — never load it from a CDN. |

Rules:
- No network calls at render time; everything runs locally in the browser.
- Every exported function gets a TSDoc comment stating inputs, outputs, and throw
  conditions.

---

## 3. Project layout

```
mermaid-image/
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ index.html
├─ .eslintrc.cjs
├─ .prettierrc
├─ .gitignore
├─ README.md
├─ .github/workflows/
│  └─ deploy-pages.yml          # build -> GitHub Pages
└─ src/
   ├─ main.ts                   # wires editor + preview + options + downloads
   ├─ editor.ts                 # CodeMirror 6 setup
   ├─ preview.ts                # debounced mermaid render into the preview pane
   ├─ options-panel.ts          # UI controls <-> RenderOptions
   ├─ export-svg.ts
   ├─ export-png.ts
   ├─ export-pdf.ts
   ├─ styles.css
   └─ options/                  # the option core (internal modules)
      ├─ index.ts
      ├─ schema.ts              # zod schema + inferred types
      ├─ defaults.ts            # DEFAULTS, LIMITS, MERMAID_VERSION
      ├─ normalize.ts           # normalize(): options -> NormalizedRender
      └─ errors.ts              # ValidationError
```

---

## 4. Option core (`src/options`)

### 4.1 `defaults.ts`
```ts
export const MERMAID_VERSION: string;            // pinned exact version string

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
```

### 4.2 `schema.ts`
zod schema producing this type (rules in comments):
```ts
export interface RenderOptions {
  code: string;                                   // required, 1..MAX_CODE_BYTES bytes (UTF-8)
  theme?: "default" | "dark" | "forest" | "neutral";
  background?: string;                            // "transparent" | "white" | any valid CSS color
  scale?: 1 | 2 | 3;                              // PNG only; default 2
  width?: number | null;                          // px, MIN..MAX_DIMENSION when set
  height?: number | null;                         // px, MIN..MAX_DIMENSION when set
  fit?: "content" | "fixed";                      // default "content"
  config?: Record<string, unknown>;              // raw Mermaid config passthrough
}
```
- `background`: accept the literals plus any permissive CSS-color match (hex,
  `rgb()/rgba()`, named); reject obviously invalid input.
- `fit === "fixed"` requires at least one of `width`/`height`, else `ValidationError`.
- Unknown top-level keys: reject (`strict` object).
- (No `format` field — the site exposes SVG/PNG/PDF as buttons, not an option.)

### 4.3 `normalize.ts`
```ts
export interface NormalizedRender {
  code: string;
  mermaidConfig: Record<string, unknown>;        // passed to mermaid.initialize()
  renderParams: {
    background: string;                          // "transparent" or a CSS color
    scale: 1 | 2 | 3;
    width: number | null;
    height: number | null;
    fit: "content" | "fixed";
  };
}

/**
 * Validates raw input, applies defaults, and builds the effective Mermaid config.
 * @throws ValidationError when input fails the schema.
 */
export function normalize(input: unknown): NormalizedRender;
```

**Config merge precedence (implement exactly):**
1. Base = deep clone of `input.config ?? {}`.
2. Apply convenience options on top (override on conflict):
   - `theme` → `mermaidConfig.theme`
   - force `mermaidConfig.securityLevel = "strict"` (passthrough may not loosen it)
   - force `mermaidConfig.startOnLoad = false`
3. `background` is carried in `renderParams` (applied by the exporters via
   CSS/canvas), not a Mermaid config key.

### 4.4 `errors.ts`
```ts
export class ValidationError extends Error {}     // schema/validation failures
```
Mermaid syntax errors are surfaced by `preview.ts` as inline text (see §5.2).

---

## 5. The site (`src`)

### 5.1 Stack
- Vite + vanilla TypeScript. **CodeMirror 6** editor. **Mermaid** for rendering.
  **jsPDF** + **svg2pdf.js** for PDF.
- Vite `base` set for GitHub Pages project hosting (e.g. `./` or `/<repo-name>/`).

### 5.2 Layout & behavior
- Split pane: CodeMirror editor (left) | preview (right).
- Options panel mapping to `RenderOptions`, feeding both preview and exporters:
  theme select; background (transparent / white / custom color picker); PNG scale
  (1/2/3); fit (content/fixed) with width/height inputs; an "Advanced config (JSON)"
  textarea for `config` passthrough.
- Three download buttons: **SVG**, **PNG**, **PDF**.
- **Live preview:** re-render **300 ms** after the last keystroke or option change
  (debounced). On invalid Mermaid syntax (or invalid advanced-config JSON), show the
  message inline in the preview pane; never break layout.
- All rendering goes through `normalize()` so preview and downloads agree.

### 5.3 Exporters
- `export-svg.ts`: serialize the rendered SVG node → `Blob({type:"image/svg+xml"})`
  → download `diagram.svg`.
- `export-png.ts`: inline computed styles/fonts into the SVG, load into an `Image`,
  draw onto a `<canvas>` sized `bbox * scale` (`ctx.scale(scale, scale)`), fill
  `background` first unless transparent, `canvas.toBlob("image/png")` →
  `diagram.png`.
- `export-pdf.ts`: create a `jsPDF` doc sized to the diagram and render the SVG with
  `svg2pdf.js` (vector); if svg2pdf throws on unsupported features, fall back to
  embedding the PNG → `diagram.pdf`.

> Visual aesthetics (palette, typography, spacing, component styling) are left to the
> implementer's judgment; only behavior and controls are specified here.

---

## 6. CI/CD (`.github/workflows/deploy-pages.yml`)

On push to `main`: install, build, deploy `dist/` to GitHub Pages via the official
Pages actions.

---

## 7. Testing (lightweight smoke tests)

Use **Vitest**. Required tests only:
1. `normalize()`: applies defaults, enforces the `fixed`-needs-dimension rule, rejects
   unknown keys, forces `securityLevel:"strict"` and `startOnLoad:false`, folds
   `theme` into `mermaidConfig`.
2. Exporters: each produces a non-empty Blob of the correct MIME type for a trivial
   SVG (jsdom/happy-dom acceptable; canvas/PDF may be shimmed).

No coverage thresholds.

---

## 8. Build order (milestones)

- **M0** — Project skeleton: Vite + TS + lint/format, empty `src` modules, `index.html`.
- **M1** — `src/options`: schema, defaults, normalize, errors + unit tests.
- **M2** — Editor + debounced preview + options panel (live rendering working).
- **M3** — Three exporters + exporter smoke tests + Pages workflow.

---

## 9. Acceptance criteria (definition of done)

- [ ] `pnpm install && pnpm build` succeeds from a clean checkout; `pnpm test` passes.
- [ ] No server, API, Docker, CLI, or Puppeteer code exists anywhere in the repo.
- [ ] Option types/defaults/normalization live only in `src/options` and are imported
      by the UI and exporters.
- [ ] Mermaid is pinned to one exact version (`MERMAID_VERSION`) and bundled, never
      loaded from a CDN.
- [ ] The site live-previews with a 300 ms debounce and shows inline errors for both
      invalid Mermaid and invalid advanced-config JSON.
- [ ] `theme`, `background`, `scale`, `width/height`/`fit`, and `config` passthrough
      all observably affect output, with the documented precedence.
- [ ] SVG, PNG (honoring scale + background), and PDF all download correctly.
- [ ] The built site runs fully client-side with no render-time network calls and
      deploys to GitHub Pages.