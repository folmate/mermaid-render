# Mermaid → Image — Implementation Specification

**Audience:** an autonomous coding agent implementing this project from scratch.
**Authority:** this document is the single source of truth. Where it is explicit,
follow it exactly. Where it is silent, choose the simplest, most conventional option
and note the choice in the PR description. Do not introduce frameworks, services, or
abstractions not listed here.

---

## 1. Goal & scope

Build a tool that renders **Mermaid diagram source** into **SVG, PNG, and PDF**,
shipped as two front-ends over one shared core, in a single monorepo:

1. **`apps/web`** — a 100% client-side static site (no runtime server) deployed to
   GitHub Pages. A live split-pane editor with download buttons.
2. **`apps/server`** — a Node + Puppeteer REST API, containerized with Docker, run on
   a personal server behind Cloudflare.
3. **`packages/shared`** — the option schema, defaults, and normalization logic used
   by **both** apps so output is identical across them.

### In scope (v1)
Everything in this document.

### Explicitly out of scope (v1) — do not build
- Authentication, API keys, rate limiting (Cloudflare handles ingress).
- Caching layers.
- A `GET /render?code=...` query endpoint.
- A batch endpoint.
- Persistence/databases.
- Server-rendered or framework UI (React/Vue/Svelte). The site is vanilla TS + Vite.

---

## 2. Toolchain & global conventions

| Item | Requirement |
|------|-------------|
| Language | TypeScript, `"strict": true`, no implicit `any`. |
| Runtime | Node.js 20 LTS (≥ 20.11). |
| Package manager | **pnpm** workspaces. |
| Module system | ESM (`"type": "module"`) across all packages. |
| Linting | ESLint + Prettier, default-recommended configs. |
| Dependency pinning | Pin **exact** versions in every `package.json` (no `^`/`~`). |
| Mermaid version | Install the latest stable Mermaid release at build time, pin it exactly, and export it as `MERMAID_VERSION` from `packages/shared`. Both apps must use this exact version — never load Mermaid from a CDN. |

General rules:
- All cross-app types and option logic live in `packages/shared` and are imported;
  never duplicated.
- No network access at render time. Bundle Mermaid locally.
- Every exported function gets a TSDoc comment stating inputs, outputs, and throw
  conditions.

---

## 3. Repository layout

Create exactly this structure.

```
mermaid-image/
├─ package.json                 # root: workspace scripts only
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ .eslintrc.cjs
├─ .prettierrc
├─ .gitignore
├─ README.md
├─ .github/workflows/
│  └─ deploy-pages.yml          # build apps/web -> GitHub Pages
├─ packages/
│  └─ shared/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts            # re-exports public API
│        ├─ schema.ts           # zod schema + inferred types
│        ├─ defaults.ts         # DEFAULTS, bounds, MERMAID_VERSION
│        ├─ normalize.ts        # normalize(): options -> NormalizedRender
│        └─ errors.ts           # ValidationError, ParseError, etc.
└─ apps/
   ├─ web/
   │  ├─ package.json
   │  ├─ tsconfig.json
   │  ├─ vite.config.ts
   │  ├─ index.html
   │  └─ src/
   │     ├─ main.ts             # wires editor + preview + options + downloads
   │     ├─ editor.ts           # CodeMirror 6 setup
   │     ├─ preview.ts          # debounced mermaid render into preview pane
   │     ├─ options-panel.ts    # UI controls -> RenderOptions
   │     ├─ export-svg.ts
   │     ├─ export-png.ts
   │     ├─ export-pdf.ts
   │     └─ styles.css
   └─ server/
      ├─ package.json
      ├─ tsconfig.json
      ├─ Dockerfile
      ├─ .dockerignore
      └─ src/
         ├─ server.ts           # Fastify app, routes, content negotiation
         ├─ render.ts           # renderOnServer(): NormalizedRender -> bytes
         ├─ browser-pool.ts     # warm browser + concurrency-limited page lease
         ├─ mermaid-page.ts     # HTML shell + mermaid injection helper
         └─ config.ts           # env-driven config with defaults
```

---

## 4. `packages/shared` — the contract

### 4.1 `defaults.ts`

```ts
export const MERMAID_VERSION: string;          // pinned exact version string

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

Define a zod schema producing this type (validation rules in comments):

```ts
export interface RenderOptions {
  code: string;                                   // required, 1..MAX_CODE_BYTES bytes (UTF-8)
  format?: "svg" | "png" | "pdf";                 // default "svg" (server uses it; web ignores)
  theme?: "default" | "dark" | "forest" | "neutral";
  background?: string;                            // "transparent" | "white" | any valid CSS color
  scale?: 1 | 2 | 3;                              // PNG only; default 2
  width?: number | null;                          // px, MIN..MAX_DIMENSION when set
  height?: number | null;                         // px, MIN..MAX_DIMENSION when set
  fit?: "content" | "fixed";                      // default "content"
  config?: Record<string, unknown>;              // raw Mermaid config passthrough
}
```

- `background` validation: accept the literals plus any string matching a permissive
  CSS-color check (hex, `rgb()/rgba()`, named colors). Reject obviously invalid input.
- When `fit === "fixed"`, at least one of `width`/`height` must be provided, else a
  `ValidationError`.
- Unknown top-level keys: reject (`strict` object).

### 4.3 `normalize.ts`

```ts
export interface NormalizedRender {
  code: string;
  format: "svg" | "png" | "pdf";
  mermaidConfig: Record<string, unknown>;        // pass to mermaid.initialize()
  renderParams: {
    background: string;                          // resolved: "transparent" or a CSS color
    scale: 1 | 2 | 3;
    width: number | null;
    height: number | null;
    fit: "content" | "fixed";
  };
}

/**
 * Validates raw input against the schema, applies defaults, and builds the
 * effective Mermaid config.
 * @throws ValidationError when input fails the schema.
 */
export function normalize(input: unknown): NormalizedRender;
```

**Config merge precedence (must be implemented exactly):**
1. Start from `input.config ?? {}` (deep clone — base layer).
2. Apply convenience options on top, overriding the base on conflict:
   - `theme` → `mermaidConfig.theme`
   - `securityLevel` → force `"strict"` regardless of passthrough (do not let
     passthrough loosen it).
   - `startOnLoad` → force `false`.
3. `background` is **not** a Mermaid config key; it is carried in `renderParams` and
   applied by the renderers (§6).

### 4.4 `errors.ts`

Typed error classes, each with a stable `type` string used in API responses:

```ts
class ValidationError      // type: "ValidationError"   -> HTTP 400
class ParseError           // type: "ParseError"        -> HTTP 400 (invalid Mermaid)
class PayloadTooLargeError // type: "PayloadTooLarge"   -> HTTP 413
class TimeoutError         // type: "Timeout"           -> HTTP 408
// any other -> type: "InternalError"                   -> HTTP 500
```

---

## 5. `apps/server` — REST API

### 5.1 Framework & config

- Framework: **Fastify**.
- `config.ts` reads env with these defaults:

| Env | Default | Meaning |
|-----|---------|---------|
| `PORT` | `8080` | listen port |
| `HOST` | `0.0.0.0` | bind address |
| `MAX_CONCURRENCY` | `4` | simultaneous Puppeteer pages |
| `RENDER_TIMEOUT_MS` | `10000` | per-render hard timeout |
| `MAX_CODE_BYTES` | `50000` | request body code cap |

Fastify body limit must be set so oversized requests yield `413`
(`PayloadTooLargeError` shape).

### 5.2 Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/render` | render a diagram |
| `GET`  | `/healthz` | returns `200 {"status":"ok","browser":<bool>}` when browser is ready |
| `GET`  | `/` | returns JSON API info (version, endpoints, option schema summary) |

### 5.3 `POST /render` contract

Request: `Content-Type: application/json`, body = `RenderOptions` (§4.2) including
`format`.

**Response — content negotiation:**
- **Default (any/none/`*/*`):** raw bytes.
  - `image/svg+xml` for svg, `image/png` for png, `application/pdf` for pdf.
  - Add `Content-Disposition: inline; filename="diagram.<ext>"`.
- **`Accept: application/json`:**
  ```json
  {
    "format": "png",
    "data": "<base64>",
    "meta": { "width": 812, "height": 460, "scale": 2 }
  }
  ```

**Errors — always JSON, regardless of `Accept`:**
```json
{ "error": { "type": "ParseError", "message": "Parse error on line 2: ..." } }
```
Status mapping per §4.4. Invalid Mermaid syntax → `400 ParseError` with Mermaid's
message in `message`.

**Worked example (raw):**
```bash
curl -s -X POST http://localhost:8080/render \
  -H 'Content-Type: application/json' \
  -d '{"code":"graph TD; A-->B","format":"png","scale":2,"theme":"dark"}' \
  --output diagram.png
```

**Worked example (JSON):**
```bash
curl -s -X POST http://localhost:8080/render \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{"code":"graph TD; A-->B","format":"svg"}'
# -> { "format":"svg", "data":"PHN2Zy...", "meta":{...} }
```

### 5.4 `browser-pool.ts`

```ts
export async function getBrowser(): Promise<Browser>;   // warm singleton, lazy-launched
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T>;
export async function closeBrowser(): Promise<void>;    // called on graceful shutdown
```

- Launch one Chromium with flags `--no-sandbox --disable-setuid-sandbox` (required in
  container).
- `withPage` enforces `MAX_CONCURRENCY` via a simple queue/semaphore; opens a fresh
  page, guarantees `page.close()` in `finally`, and wraps the work in
  `RENDER_TIMEOUT_MS` (reject with `TimeoutError` on expiry).
- Register `SIGINT`/`SIGTERM` handlers that call `closeBrowser()` then exit.

### 5.5 `mermaid-page.ts` & `render.ts`

`mermaid-page.ts` provides a minimal HTML document and injects the **locally bundled**
Mermaid UMD build (copied from `node_modules` at build time) via
`page.addScriptTag({ path })`. Never fetch Mermaid over the network.

`render.ts`:
```ts
export interface RenderResult {
  buffer: Buffer;            // svg returns Buffer.from(svgString, "utf8")
  contentType: string;
  meta: { width: number; height: number; scale: number };
}
export async function renderOnServer(n: NormalizedRender): Promise<RenderResult>;
```

Algorithm per format (all run inside `withPage`):

1. **Common:** `page.setContent(shell)`, inject Mermaid, in `page.evaluate` call
   `mermaid.initialize(mermaidConfig)` then `mermaid.render("id", code)` to obtain the
   SVG string. If Mermaid throws, surface as `ParseError`.
2. **SVG:** return the SVG string; `contentType = "image/svg+xml"`. `meta` from the
   SVG's intrinsic width/height.
3. **PNG:** inject the SVG into the DOM. Compute the target box: if `fit==="content"`,
   use the SVG bounding box; if `"fixed"`, use the provided `width`/`height`. Call
   `page.setViewport({ width, height, deviceScaleFactor: scale })`. Apply background:
   set the container/body background to the color, or pass `omitBackground:true` to
   `element.screenshot()` when `background==="transparent"`. `contentType="image/png"`.
4. **PDF:** lay the SVG into a page sized to the box; apply background via CSS; call
   `page.pdf({ printBackground: true, width: <px>px, height: <px>px })` (vector
   output). `contentType="application/pdf"`. (`scale` is ignored for PDF; report `1`.)

---

## 6. `apps/web` — static site

### 6.1 Stack & build
- **Vite** + vanilla TypeScript. **CodeMirror 6** for the editor.
  **jsPDF** + **svg2pdf.js** for PDF. Mermaid for rendering.
- Build output must be relative-path safe for GitHub Pages project hosting (set Vite
  `base` appropriately, e.g. `./` or `/mermaid-image/`).

### 6.2 Layout & behavior
- Split pane: CodeMirror editor (left) | preview (right).
- Options panel controls, all mapping to `RenderOptions` and feeding both the preview
  and the exporters: theme select, background (transparent/white/custom color
  picker), PNG scale (1/2/3), fit (content/fixed) with width/height inputs, and an
  "Advanced config (JSON)" textarea for `config` passthrough.
- Three download buttons: **SVG**, **PNG**, **PDF**.
- **Live preview:** re-render **300 ms** after the last keystroke or option change
  (debounced). On invalid Mermaid syntax, show the error message inline in the preview
  pane; never throw to the console-only or break layout.
- Reuse `packages/shared` `normalize()` so the in-browser Mermaid config matches the
  server exactly.

### 6.3 Exporters
- `export-svg.ts`: serialize the rendered SVG node → `Blob({type:"image/svg+xml"})`
  → trigger download `diagram.svg`.
- `export-png.ts`: inline computed styles/fonts into the SVG, load it into an
  `Image`, draw onto a `<canvas>` sized `bbox * scale` (apply `ctx.scale(scale,
  scale)`), fill `background` first unless transparent, `canvas.toBlob("image/png")`
  → `diagram.png`.
- `export-pdf.ts`: create a `jsPDF` doc sized to the diagram; render the SVG with
  `svg2pdf.js` to keep it vector. If svg2pdf throws on unsupported SVG features, fall
  back to embedding the PNG (from `export-png` logic) into the PDF. → `diagram.pdf`.

> Note the one intentional divergence: server PDFs are Chromium-native vector; site
> PDFs use svg2pdf with a PNG fallback. Both are acceptable for v1.

---

## 7. Docker (`apps/server/Dockerfile`)

- Base image: the official Puppeteer image (`ghcr.io/puppeteer/puppeteer`, pinned
  tag) so Chromium + system libraries are preinstalled.
- Steps: copy workspace, `pnpm install --frozen-lockfile`, build `packages/shared` and
  `apps/server`, copy the bundled Mermaid asset, set Puppeteer to use the image's
  Chromium, run as the image's non-root user, `EXPOSE 8080`, start the server.
- `.dockerignore` excludes `node_modules`, `apps/web`, build caches.
- Document in `README.md`: `docker build`, `docker run -p 8080:8080`, and a note that
  the operator fronts it with Cloudflare Tunnel (no app-level auth in v1).

---

## 8. CI/CD (`.github/workflows/deploy-pages.yml`)

- On push to `main`: install, build `apps/web`, deploy `apps/web/dist` to GitHub
  Pages via the official Pages actions. The server is deployed manually via Docker
  (no server CD required in v1).

---

## 9. Testing (lightweight smoke tests)

Use **Vitest**. Required tests only:

1. **shared:** `normalize()` applies defaults, enforces the `fixed`-needs-dimension
   rule, rejects unknown keys, and forces `securityLevel:"strict"` / `startOnLoad:false`.
2. **server:** one integration test per format — `POST /render` with a trivial graph
   returns the correct `Content-Type` and a non-empty body for `svg`, `png`, and
   `pdf`; plus one test asserting invalid Mermaid → `400` with `type:"ParseError"`,
   and one asserting `Accept: application/json` returns base64 JSON.
3. **web:** one smoke test that each exporter produces a non-empty Blob of the right
   MIME type for a trivial SVG (jsdom/happy-dom is acceptable; canvas/PDF may be
   shimmed if needed).

No coverage thresholds. Keep total test count small.

---

## 10. Build order (milestones)

Implement and verify in this sequence; each milestone should build and run.

- **M0** — Monorepo skeleton: workspaces, tsconfig, lint/format, empty packages.
- **M1** — `packages/shared`: schema, defaults, normalize, errors + unit tests.
- **M2** — `apps/server`: browser pool, render (SVG only), `/render`, `/healthz`,
  content negotiation, error mapping.
- **M3** — Server PNG + PDF; per-format integration smoke tests.
- **M4** — `Dockerfile`; verify all three formats render inside the container.
- **M5** — `apps/web`: editor, debounced preview, options panel, three exporters,
  exporter smoke tests, Pages workflow.

---

## 11. Acceptance criteria (definition of done)

- [ ] `pnpm install && pnpm -r build` succeeds from a clean checkout.
- [ ] `pnpm -r test` passes (the §9 smoke tests).
- [ ] `packages/shared` is the only place option types/defaults/normalization exist;
      both apps import it.
- [ ] Mermaid is pinned to one exact version, exported as `MERMAID_VERSION`, and never
      loaded from a CDN.
- [ ] `POST /render` returns correct raw bytes per format by default and base64 JSON
      under `Accept: application/json`.
- [ ] Invalid Mermaid → `400 {"error":{"type":"ParseError",...}}`; oversized body →
      `413`; render timeout → `408`.
- [ ] `theme`, `background`, `scale`, `width/height`/`fit`, and `config` passthrough
      all observably affect output, with documented precedence.
- [ ] Docker image builds and renders SVG, PNG, and PDF for a sample diagram.
- [ ] The site runs fully client-side (no API calls), live-previews with a 300 ms
      debounce, shows inline parse errors, and downloads SVG/PNG/PDF.
- [ ] `README.md` documents local dev, the API contract with curl examples, Docker
      run, and Cloudflare-Tunnel fronting.
