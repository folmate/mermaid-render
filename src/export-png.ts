/**
 * Renders an SVG element to a PNG Blob via an offscreen canvas, respecting scale and background.
 *
 * @param svgEl - The SVG DOM element to export.
 * @param scale - Pixel density multiplier (1, 2, or 3).
 * @param background - CSS color for the background, or "transparent".
 * @param filename - Downloaded file name. Defaults to "diagram.png".
 * @returns Promise resolving to the PNG Blob.
 * @throws Error if the canvas cannot produce a PNG blob.
 */
export async function exportPng(
  svgEl: SVGSVGElement,
  scale: 1 | 2 | 3,
  background: string,
  filename = "diagram.png",
): Promise<Blob> {
  const bbox = svgEl.getBoundingClientRect();
  const width = Math.ceil(bbox.width || svgEl.viewBox.baseVal.width || 800);
  const height = Math.ceil(bbox.height || svgEl.viewBox.baseVal.height || 600);

  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgEl);

  // Ensure xmlns is present for the Image loader
  if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svgString = svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

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

    const blob = await canvasToBlob(canvas, "image/png");
    triggerDownload(blob, filename);
    return blob;
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

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
