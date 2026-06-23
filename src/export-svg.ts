/**
 * Serializes the given SVG element to a Blob and triggers a browser download.
 *
 * @param svgEl - The SVG DOM element to export.
 * @param filename - Downloaded file name. Defaults to "diagram.svg".
 * @returns The created SVG Blob.
 * @throws Error if svgEl serialization fails.
 */
export function exportSvg(svgEl: SVGSVGElement, filename = "diagram.svg"): Blob {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgEl);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  triggerDownload(blob, filename);
  return blob;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
