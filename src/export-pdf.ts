import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

/**
 * Exports an SVG element to a PDF.
 *
 * Attempts a vector path: the SVG is pre-processed to replace <foreignObject>
 * nodes (used by Mermaid for node labels) with <text> elements, and embedded
 * @font-face declarations are stripped so svg2pdf falls back to its built-in
 * fonts. Text will be selectable and vector-sharp, but rendered in sans-serif
 * rather than Mermaid's theme font.
 *
 * Falls back to a PNG raster embed if svg2pdf throws.
 *
 * @param svgEl - The SVG DOM element to export.
 * @param scale - Pixel density for the PNG fallback.
 * @param background - CSS background color or "transparent".
 * @param filename - Downloaded file name. Defaults to "diagram.pdf".
 * @returns Promise resolving to the PDF Blob.
 * @throws Error if both vector and raster paths fail.
 */
export async function exportPdf(
  svgEl: SVGSVGElement,
  scale: 1 | 2 | 3,
  background: string,
  filename = "diagram.pdf",
): Promise<Blob> {
  const bbox = svgEl.getBoundingClientRect();
  const widthPx = Math.ceil(bbox.width || svgEl.viewBox.baseVal.width || 800);
  const heightPx = Math.ceil(bbox.height || svgEl.viewBox.baseVal.height || 600);

  const pxToMm = 25.4 / 96;
  const widthMm = widthPx * pxToMm;
  const heightMm = heightPx * pxToMm;

  const doc = new jsPDF({
    orientation: widthMm > heightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [widthMm, heightMm],
  });

  if (background !== "transparent") {
    doc.setFillColor(background);
    doc.rect(0, 0, widthMm, heightMm, "F");
  }

  try {
    const vectorSvg = prepareForVector(svgEl);
    await svg2pdf(vectorSvg, doc, { x: 0, y: 0, width: widthMm, height: heightMm });
  } catch {
    await embedPngFallback(doc, svgEl, scale, background, widthMm, heightMm);
  }

  const blob = doc.output("blob");
  triggerDownload(blob, filename);
  return blob;
}

/**
 * Clones the SVG and transforms it into a form svg2pdf can fully render:
 * strips @font-face rules and replaces <foreignObject> nodes with <text>.
 */
function prepareForVector(svgEl: SVGSVGElement): SVGSVGElement {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  // Remove @font-face blocks — svg2pdf cannot fetch or decode them and may
  // silently skip <text> elements that reference unknown font families.
  for (const styleEl of clone.querySelectorAll("style")) {
    styleEl.textContent = (styleEl.textContent ?? "").replace(
      /@font-face\s*\{(?:[^{}]|\{[^{}]*\})*\}/gs,
      "",
    );
  }

  // Replace each <foreignObject> (Mermaid's HTML-label container) with an
  // SVG <text> element centred in the same bounding box.
  const ns = "http://www.w3.org/2000/svg";
  for (const fo of Array.from(clone.querySelectorAll("foreignObject"))) {
    const x = parseFloat(fo.getAttribute("x") ?? "0");
    const y = parseFloat(fo.getAttribute("y") ?? "0");
    const w = parseFloat(fo.getAttribute("width") ?? "0");
    const h = parseFloat(fo.getAttribute("height") ?? "0");
    const label = (fo.textContent ?? "").trim().replace(/\s+/g, " ");

    if (!label) {
      fo.remove();
      continue;
    }

    const textEl = document.createElementNS(ns, "text");
    textEl.setAttribute("x", String(x + w / 2));
    // svg2pdf uses y as the text baseline (not the visual center), so
    // dominant-baseline:"middle" alone is insufficient. dy="0.35em" shifts
    // the baseline down by ~35% of the font size, centering the glyph body.
    textEl.setAttribute("y", String(y + h / 2));
    textEl.setAttribute("dy", "0.14em");
    textEl.setAttribute("text-anchor", "middle");
    textEl.setAttribute("dominant-baseline", "middle");
    textEl.setAttribute("font-family", "sans-serif");
    textEl.setAttribute("font-size", "14");
    textEl.setAttribute("fill", "#333");
    textEl.textContent = label;
    fo.parentNode?.replaceChild(textEl, fo);
  }

  return clone;
}

async function embedPngFallback(
  doc: jsPDF,
  svgEl: SVGSVGElement,
  scale: 1 | 2 | 3,
  background: string,
  widthMm: number,
  heightMm: number,
): Promise<void> {
  const blob = await renderSvgToPngBlob(svgEl, scale, background);
  const dataUrl = await blobToDataUrl(blob);
  doc.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm);
}

async function renderSvgToPngBlob(
  svgEl: SVGSVGElement,
  scale: 1 | 2 | 3,
  background: string,
): Promise<Blob> {
  const bbox = svgEl.getBoundingClientRect();
  const width = Math.ceil(bbox.width || svgEl.viewBox.baseVal.width || 800);
  const height = Math.ceil(bbox.height || svgEl.viewBox.baseVal.height || 600);

  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgEl);
  if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svgString = svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const svgUrl = URL.createObjectURL(
    new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    if (background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    return await canvasToBlob(canvas, "image/png");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load SVG as image"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob returned null"));
    }, type);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
