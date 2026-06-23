import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

const DEFAULT_DIAGRAM = `graph TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it!]
    B -- No --> D[Debug]
    D --> B`;

/**
 * Creates and mounts a CodeMirror 6 editor into the given container.
 *
 * @param container - DOM element to mount the editor into.
 * @param onChange - Callback invoked with the current document text on every change.
 * @returns Object with a `getValue()` method to read current content.
 */
export function createEditor(
  container: HTMLElement,
  onChange: (value: string) => void,
): { getValue: () => string } {
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      onChange(update.state.doc.toString());
    }
  });

  const theme = EditorView.theme({
    "&": { height: "100%", fontSize: "14px" },
    ".cm-scroller": { overflow: "auto", fontFamily: "monospace" },
  });

  const state = EditorState.create({
    doc: DEFAULT_DIAGRAM,
    extensions: [
      EditorView.darkTheme.of(true),
      history(),
      lineNumbers(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      updateListener,
      theme,
    ],
  });

  const view = new EditorView({ state, parent: container });

  return {
    getValue: () => view.state.doc.toString(),
  };
}
