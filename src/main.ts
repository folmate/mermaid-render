import "./styles.css";
import { createEditor } from "./editor.js";
import { renderPreview } from "./preview.js";
import { createOptionsPanel } from "./options-panel.js";
import { normalize, ValidationError, type RenderOptions } from "./options/index.js";
import { exportSvg } from "./export-svg.js";
import { exportPng } from "./export-png.js";
import { exportPdf } from "./export-pdf.js";

const editorPane = document.getElementById("editor-pane")!;
const previewOutput = document.getElementById("preview-output")!;
const optionsPanel = document.getElementById("options-panel")!;
const btnSvg = document.getElementById("btn-svg")!;
const btnPng = document.getElementById("btn-png")!;
const btnPdf = document.getElementById("btn-pdf")!;

let currentSvg: SVGSVGElement | null = null;
let currentOptions: Partial<RenderOptions> = {};
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRender(code: string): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void doRender(code), 300);
}

async function doRender(code: string): Promise<void> {
  const input: RenderOptions & { code: string } = { ...currentOptions, code };
  try {
    const normalized = normalize(input);
    currentSvg = await renderPreview(previewOutput, normalized);
  } catch (err) {
    if (err instanceof ValidationError) {
      previewOutput.innerHTML = `<pre class="preview-error">${escapeHtml(err.message)}</pre>`;
    } else {
      previewOutput.innerHTML = `<pre class="preview-error">${escapeHtml(String(err))}</pre>`;
    }
    currentSvg = null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const editor = createEditor(editorPane, (code) => scheduleRender(code));

createOptionsPanel(optionsPanel, (opts) => {
  currentOptions = { ...currentOptions, ...opts };
  scheduleRender(editor.getValue());
});

// Initial render
scheduleRender(editor.getValue());

btnSvg.addEventListener("click", () => {
  if (!currentSvg) return;
  exportSvg(currentSvg);
});

btnPng.addEventListener("click", () => {
  if (!currentSvg) return;
  const scale = (currentOptions.scale ?? 2) as 1 | 2 | 3;
  const background = currentOptions.background ?? "white";
  void exportPng(currentSvg, scale, background);
});

btnPdf.addEventListener("click", () => {
  if (!currentSvg) return;
  const scale = (currentOptions.scale ?? 2) as 1 | 2 | 3;
  const background = currentOptions.background ?? "white";
  void exportPdf(currentSvg, scale, background);
});
