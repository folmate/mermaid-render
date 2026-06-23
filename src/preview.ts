import mermaid from "mermaid";
import type { NormalizedRender } from "./options/index.js";

let renderCounter = 0;

/**
 * Initializes Mermaid with the given config and renders the diagram into the container.
 * On error, shows the error message inline without breaking layout.
 *
 * @param container - DOM element to render the diagram into.
 * @param normalized - Normalized render options including code and mermaid config.
 * @returns The rendered SVG element, or null on error.
 */
export async function renderPreview(
  container: HTMLElement,
  normalized: NormalizedRender,
): Promise<SVGSVGElement | null> {
  mermaid.initialize({
    ...normalized.mermaidConfig,
    startOnLoad: false,
  });

  const id = `mermaid-${++renderCounter}`;

  try {
    const { svg } = await mermaid.render(id, normalized.code);
    container.innerHTML = svg;

    const svgEl = container.querySelector("svg");
    if (svgEl) {
      svgEl.style.maxWidth = "100%";
      if (normalized.renderParams.fit === "fixed") {
        if (normalized.renderParams.width != null) {
          svgEl.style.width = `${normalized.renderParams.width}px`;
        }
        if (normalized.renderParams.height != null) {
          svgEl.style.height = `${normalized.renderParams.height}px`;
        }
      }
    }

    return svgEl as SVGSVGElement | null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    container.innerHTML = `<pre class="preview-error">${escapeHtml(msg)}</pre>`;
    return null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
