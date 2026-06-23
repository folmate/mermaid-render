import type { RenderOptions } from "./options/index.js";

type ChangeCallback = (opts: Partial<RenderOptions>) => void;

/**
 * Builds the options panel UI and mounts it into the container.
 * Calls onChange with a partial RenderOptions whenever any control changes.
 *
 * @param container - DOM element to mount the options panel into.
 * @param onChange - Callback invoked with changed option values.
 */
export function createOptionsPanel(container: HTMLElement, onChange: ChangeCallback): void {
  container.innerHTML = `
    <div class="options-group">
      <label>Theme
        <select id="opt-theme">
          <option value="default">Default</option>
          <option value="dark">Dark</option>
          <option value="forest">Forest</option>
          <option value="neutral">Neutral</option>
        </select>
      </label>
    </div>

    <div class="options-group">
      <label>Background
        <select id="opt-bg-preset">
          <option value="white">White</option>
          <option value="transparent">Transparent</option>
          <option value="custom">Custom…</option>
        </select>
      </label>
      <input type="color" id="opt-bg-color" value="#ffffff" style="display:none" />
    </div>

    <div class="options-group">
      <label>PNG Scale
        <select id="opt-scale">
          <option value="1">1×</option>
          <option value="2" selected>2×</option>
          <option value="3">3×</option>
        </select>
      </label>
    </div>

    <div class="options-group">
      <label>Fit
        <select id="opt-fit">
          <option value="content" selected>Content</option>
          <option value="fixed">Fixed</option>
        </select>
      </label>
      <div id="opt-dimensions" style="display:none">
        <label>Width (px)
          <input type="number" id="opt-width" min="1" max="10000" placeholder="auto" />
        </label>
        <label>Height (px)
          <input type="number" id="opt-height" min="1" max="10000" placeholder="auto" />
        </label>
      </div>
    </div>

    <div class="options-group">
      <label>Advanced config (JSON)
        <textarea id="opt-config" rows="4" placeholder='{"flowchart": {"curve": "basis"}}'></textarea>
      </label>
      <span id="opt-config-error" class="field-error"></span>
    </div>
  `;

  const themeEl = container.querySelector<HTMLSelectElement>("#opt-theme")!;
  const bgPresetEl = container.querySelector<HTMLSelectElement>("#opt-bg-preset")!;
  const bgColorEl = container.querySelector<HTMLInputElement>("#opt-bg-color")!;
  const scaleEl = container.querySelector<HTMLSelectElement>("#opt-scale")!;
  const fitEl = container.querySelector<HTMLSelectElement>("#opt-fit")!;
  const dimensionsEl = container.querySelector<HTMLDivElement>("#opt-dimensions")!;
  const widthEl = container.querySelector<HTMLInputElement>("#opt-width")!;
  const heightEl = container.querySelector<HTMLInputElement>("#opt-height")!;
  const configEl = container.querySelector<HTMLTextAreaElement>("#opt-config")!;
  const configErrorEl = container.querySelector<HTMLSpanElement>("#opt-config-error")!;

  function emit(): void {
    const partial: Partial<RenderOptions> = {};

    partial.theme = themeEl.value as RenderOptions["theme"];

    if (bgPresetEl.value === "custom") {
      partial.background = bgColorEl.value;
    } else {
      partial.background = bgPresetEl.value;
    }

    partial.scale = Number(scaleEl.value) as 1 | 2 | 3;
    partial.fit = fitEl.value as "content" | "fixed";

    const w = widthEl.value ? Number(widthEl.value) : null;
    const h = heightEl.value ? Number(heightEl.value) : null;
    partial.width = w;
    partial.height = h;

    const configText = configEl.value.trim();
    if (configText) {
      try {
        partial.config = JSON.parse(configText) as Record<string, unknown>;
        configErrorEl.textContent = "";
      } catch {
        configErrorEl.textContent = "Invalid JSON";
        return;
      }
    } else {
      partial.config = undefined;
      configErrorEl.textContent = "";
    }

    onChange(partial);
  }

  bgPresetEl.addEventListener("change", () => {
    bgColorEl.style.display = bgPresetEl.value === "custom" ? "inline-block" : "none";
    emit();
  });

  fitEl.addEventListener("change", () => {
    dimensionsEl.style.display = fitEl.value === "fixed" ? "block" : "none";
    emit();
  });

  themeEl.addEventListener("change", emit);
  bgColorEl.addEventListener("input", emit);
  scaleEl.addEventListener("change", emit);
  widthEl.addEventListener("input", emit);
  heightEl.addEventListener("input", emit);
  configEl.addEventListener("input", emit);
}
