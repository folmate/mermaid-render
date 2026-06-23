import { describe, it, expect, vi, beforeEach } from "vitest";

// Top-level mocks (hoisted by vitest)
vi.mock("jspdf", () => {
  class FakeJsPDF {
    setFillColor = vi.fn();
    rect = vi.fn();
    addImage = vi.fn();
    output = vi.fn(() => new Blob(["fakepdf"], { type: "application/pdf" }));
  }
  return { jsPDF: FakeJsPDF };
});

vi.mock("svg2pdf.js", () => ({
  svg2pdf: vi.fn().mockResolvedValue(undefined),
}));

import { exportSvg } from "./export-svg.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSvgEl(): SVGSVGElement {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg") as SVGSVGElement;
  svg.setAttribute("xmlns", svgNs);
  svg.setAttribute("width", "100");
  svg.setAttribute("height", "100");
  svg.setAttribute("viewBox", "0 0 100 100");
  const rect = document.createElementNS(svgNs, "rect");
  rect.setAttribute("width", "100");
  rect.setAttribute("height", "100");
  rect.setAttribute("fill", "blue");
  svg.appendChild(rect);
  return svg;
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Stub only createObjectURL / revokeObjectURL on the real URL class
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
  vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
  // Stub anchor clicks
  const orig = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = orig(tag);
    if (tag === "a") {
      Object.defineProperty(el, "click", { value: vi.fn(), writable: true });
    }
    return el;
  });
});

// ── SVG exporter ──────────────────────────────────────────────────────────────

describe("exportSvg()", () => {
  it("returns a non-empty Blob", () => {
    const blob = exportSvg(makeSvgEl());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("returns a Blob with type image/svg+xml", () => {
    const blob = exportSvg(makeSvgEl());
    expect(blob.type).toBe("image/svg+xml");
  });
});

// ── PNG exporter ──────────────────────────────────────────────────────────────

describe("exportPng()", () => {
  it("returns a non-empty Blob with type image/png", async () => {
    const fakeBlob = new Blob(["fakepng"], { type: "image/png" });
    const fakeCtx = {
      scale: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: "",
    };
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeCtx),
      toBlob: vi.fn((cb: (b: Blob) => void) => setTimeout(() => cb(fakeBlob), 0)),
    };

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return fakeCanvas as unknown as HTMLElement;
      if (tag === "a") {
        return { href: "", download: "", click: vi.fn() } as unknown as HTMLElement;
      }
      return origCreate(tag);
    });

    // Stub Image so load fires immediately
    const OrigImage = globalThis.Image;
    const FakeImage = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 100;
      height = 100;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    };
    vi.stubGlobal("Image", FakeImage);

    const { exportPng } = await import("./export-png.js");
    const blob = await exportPng(makeSvgEl(), 2, "white");

    vi.stubGlobal("Image", OrigImage);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("image/png");
  });
});

// ── PDF exporter ──────────────────────────────────────────────────────────────

describe("exportPdf()", () => {
  it("returns a non-empty Blob", async () => {
    const { exportPdf } = await import("./export-pdf.js");
    const blob = await exportPdf(makeSvgEl(), 2, "white");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
