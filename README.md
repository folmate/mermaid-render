# Mermaid Renderer

A 100% client-side static website that renders Mermaid diagram source into SVG, PNG, and PDF.

## Features

- Live preview with 300 ms debounce
- Export as SVG, PNG (with configurable scale), or PDF (vector via svg2pdf, raster fallback)
- Options: theme, background, PNG scale, fit mode, width/height, raw Mermaid config passthrough
- No server, no API, no CDN at render time — runs entirely in the browser

## Development

```sh
pnpm install
pnpm dev        # start dev server
pnpm test       # run unit tests
pnpm build      # production build to dist/
```

## Tech stack

- Vite + TypeScript (strict)
- CodeMirror 6 (editor)
- Mermaid 11.15.0 (bundled, not CDN)
- jsPDF + svg2pdf.js (PDF export)
- Zod (option validation)
- Vitest (tests)
