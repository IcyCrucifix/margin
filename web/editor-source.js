import { autocompletion, closeCompletion, completionKeymap, startCompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  drawSelection,
  highlightActiveLine,
  keymap,
  placeholder,
} from "@codemirror/view";
import { mathjax } from "@mathjax/src/mjs/mathjax.js";
import { TeX } from "@mathjax/src/mjs/input/tex.js";
import { SVG } from "@mathjax/src/mjs/output/svg.js";
import { browserAdaptor } from "@mathjax/src/mjs/adaptors/browserAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/mjs/handlers/html.js";
import "@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js";

const adaptor = browserAdaptor();
RegisterHTMLHandler(adaptor);
const texInput = new TeX({ packages: ["base", "ams", "newcommand"] });
const svgOutput = new SVG({ fontCache: "local" });
const mathDocument = mathjax.document(document, { InputJax: texInput, OutputJax: svgOutput });
const mathCache = new Map();

async function renderMath(source, display) {
  const cacheKey = `${display ? "display" : "inline"}:${source}`;
  if (!mathCache.has(cacheKey)) {
    const result = mathDocument.convertPromise(source, {
      display,
      em: 16,
      ex: 8,
      containerWidth: 80 * 16,
    }).then((node) => adaptor.outerHTML(node));
    mathCache.set(cacheKey, result);
  }
  return mathCache.get(cacheKey);
}

function isEscaped(text, position) {
  let slashes = 0;
  for (let index = position - 1; index >= 0 && text[index] === "\\"; index -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function skipInlineCode(text, start) {
  let ticks = 1;
  while (text[start + ticks] === "`") ticks += 1;
  const marker = "`".repeat(ticks);
  const close = text.indexOf(marker, start + ticks);
  return close === -1 ? text.length : close + ticks;
}

function findClosingDelimiter(text, start, delimiter, allowNewlines) {
  for (let index = start; index <= text.length - delimiter.length; index += 1) {
    if (!allowNewlines && text[index] === "\n") return -1;
    if (text.startsWith(delimiter, index) && !isEscaped(text, index)) return index;
  }
  return -1;
}

function parseMath(text) {
  const ranges = [];
  let index = 0;
  let fence = null;

  while (index < text.length) {
    const lineStart = index === 0 || text[index - 1] === "\n";
    if (lineStart) {
      const lineEnd = text.indexOf("\n", index);
      const end = lineEnd === -1 ? text.length : lineEnd;
      const line = text.slice(index, end);
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (!fence) fence = marker;
        else if (fence === marker) fence = null;
        index = lineEnd === -1 ? text.length : lineEnd + 1;
        continue;
      }
      if (fence) {
        index = lineEnd === -1 ? text.length : lineEnd + 1;
        continue;
      }
    }

    if (text[index] === "`") {
      index = skipInlineCode(text, index);
      continue;
    }
    if (text[index] !== "$" || isEscaped(text, index)) {
      index += 1;
      continue;
    }

    const display = text[index + 1] === "$";
    const delimiter = display ? "$$" : "$";
    const sourceStart = index + delimiter.length;
    const close = findClosingDelimiter(text, sourceStart, delimiter, display);
    if (close === -1) {
      index += delimiter.length;
      continue;
    }

    const source = text.slice(sourceStart, close);
    if (!source.trim() || (!display && /^\s|\s$/.test(source))) {
      index += delimiter.length;
      continue;
    }

    ranges.push({
      from: index,
      to: close + delimiter.length,
      source,
      display,
    });
    index = close + delimiter.length;
  }
  return ranges;
}

function selectionTouches(range, selection) {
  return selection.ranges.some((selected) => (
    selected.empty
      ? selected.head >= range.from && selected.head < range.to
      : selected.from < range.to && selected.to > range.from
  ));
}

class MathWidget extends WidgetType {
  constructor(range) {
    super();
    this.range = range;
  }

  eq(other) {
    return other.range.source === this.range.source
      && other.range.display === this.range.display
      && other.range.from === this.range.from
      && other.range.to === this.range.to;
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = `cm-math-widget ${this.range.display ? "cm-math-display" : "cm-math-inline"} is-loading`;
    element.dataset.from = String(this.range.from);
    element.dataset.to = String(this.range.to);
    element.setAttribute("aria-label", `LaTeX: ${this.range.source.trim()}`);
    element.textContent = this.range.source.trim();
    renderMath(this.range.source, this.range.display)
      .then((markup) => {
        element.innerHTML = markup;
        element.classList.remove("is-loading");
      })
      .catch(() => {
        element.classList.remove("is-loading");
        element.classList.add("has-error");
        element.textContent = this.range.display
          ? `$$${this.range.source}$$`
          : `$${this.range.source}$`;
      });
    return element;
  }

  ignoreEvent() {
    return false;
  }
}

function mathDecorations(state, focused) {
  const text = state.doc.toString();
  const replacements = parseMath(text)
    .filter((range) => !focused || !selectionTouches(range, state.selection))
    .map((range) => Decoration.replace({ widget: new MathWidget(range) }).range(range.from, range.to));
  return Decoration.set(replacements, true);
}

const setMathEditorFocus = StateEffect.define();
const liveMath = StateField.define({
  create: (state) => ({ focused: false, decorations: mathDecorations(state, false) }),
  update(value, transaction) {
    let focused = value.focused;
    let focusChanged = false;
    for (const effect of transaction.effects) {
      if (effect.is(setMathEditorFocus)) {
        focused = effect.value;
        focusChanged = focused !== value.focused;
      }
    }
    return transaction.docChanged || transaction.selection || focusChanged
      ? { focused, decorations: mathDecorations(transaction.state, focused) }
      : value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

const liveMathInteraction = EditorView.domEventHandlers({
  focus(_event, view) {
    view.dispatch({ effects: setMathEditorFocus.of(true) });
    return false;
  },
  blur(_event, view) {
    view.dispatch({ effects: setMathEditorFocus.of(false) });
    return false;
  },
  mousedown(event, view) {
    const widget = event.target.closest?.(".cm-math-widget");
    if (!widget) return false;
    const from = Number(widget.dataset.from);
    const to = Number(widget.dataset.to);
    const position = Math.min(to - 1, from + (widget.classList.contains("cm-math-display") ? 2 : 1));
    view.dispatch({ selection: { anchor: position } });
    view.focus();
    event.preventDefault();
    return true;
  },
});

const symbols = [
  ["\\alpha", "α", "Small alpha"], ["\\beta", "β", "Small beta"],
  ["\\gamma", "γ", "Small gamma"], ["\\Gamma", "Γ", "Capital gamma"],
  ["\\delta", "δ", "Small delta"], ["\\Delta", "Δ", "Capital delta"],
  ["\\epsilon", "ε", "Small epsilon"], ["\\varepsilon", "ϵ", "Variant epsilon"],
  ["\\zeta", "ζ", "Small zeta"], ["\\eta", "η", "Small eta"],
  ["\\theta", "θ", "Small theta"], ["\\Theta", "Θ", "Capital theta"],
  ["\\vartheta", "ϑ", "Variant theta"], ["\\iota", "ι", "Small iota"],
  ["\\kappa", "κ", "Small kappa"], ["\\lambda", "λ", "Small lambda"],
  ["\\Lambda", "Λ", "Capital lambda"], ["\\mu", "μ", "Small mu"],
  ["\\nu", "ν", "Small nu"], ["\\xi", "ξ", "Small xi"],
  ["\\Xi", "Ξ", "Capital xi"], ["\\pi", "π", "Small pi"],
  ["\\Pi", "Π", "Capital pi"], ["\\rho", "ρ", "Small rho"],
  ["\\sigma", "σ", "Small sigma"], ["\\Sigma", "Σ", "Capital sigma"],
  ["\\tau", "τ", "Small tau"], ["\\upsilon", "υ", "Small upsilon"],
  ["\\phi", "ϕ", "Small phi"], ["\\Phi", "Φ", "Capital phi"],
  ["\\varphi", "φ", "Variant phi"], ["\\chi", "χ", "Small chi"],
  ["\\psi", "ψ", "Small psi"], ["\\Psi", "Ψ", "Capital psi"],
  ["\\omega", "ω", "Small omega"], ["\\Omega", "Ω", "Capital omega"],
  ["\\sum", "∑", "Summation"], ["\\prod", "∏", "Product"],
  ["\\int", "∫", "Integral"], ["\\oint", "∮", "Contour integral"],
  ["\\infty", "∞", "Infinity"], ["\\partial", "∂", "Partial derivative"],
  ["\\nabla", "∇", "Nabla / gradient"], ["\\sqrt{}", "√", "Square root"],
  ["\\frac{}{}", "a/b", "Fraction"], ["\\cdot", "·", "Centered dot"],
  ["\\times", "×", "Multiplication"], ["\\div", "÷", "Division"],
  ["\\pm", "±", "Plus or minus"], ["\\leq", "≤", "Less than or equal"],
  ["\\geq", "≥", "Greater than or equal"], ["\\neq", "≠", "Not equal"],
  ["\\approx", "≈", "Approximately equal"], ["\\equiv", "≡", "Equivalent"],
  ["\\rightarrow", "→", "Right arrow"], ["\\leftarrow", "←", "Left arrow"],
  ["\\Rightarrow", "⇒", "Implies"], ["\\leftrightarrow", "↔", "Two-way arrow"],
  ["\\forall", "∀", "For all"], ["\\exists", "∃", "There exists"],
  ["\\in", "∈", "Element of"], ["\\notin", "∉", "Not an element of"],
  ["\\subset", "⊂", "Subset"], ["\\cup", "∪", "Set union"],
  ["\\cap", "∩", "Set intersection"], ["\\land", "∧", "Logical and"],
  ["\\lor", "∨", "Logical or"], ["\\neg", "¬", "Logical not"],
];

function insideMath(text, position) {
  return parseMath(text).some((range) => position > range.from && position < range.to);
}

function latexCompletionSource(context) {
  const match = context.matchBefore(/\\[A-Za-z]*/);
  if (!match) return null;
  return {
    from: match.from,
    validFor: /^\\[A-Za-z]*$/,
    options: symbols.map(([command, glyph, detail]) => ({
      label: command,
      displayLabel: `${glyph}  ${command}`,
      detail,
      type: "keyword",
      apply(view, completion, from, to) {
        const raw = completion.label;
        const insert = insideMath(view.state.doc.toString(), from) ? raw : `$${raw}$`;
        const emptyBraces = insert.indexOf("{}");
        const cursor = emptyBraces === -1 ? from + insert.length : from + emptyBraces + 1;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: cursor },
        });
      },
    })),
  };
}

function replaceSelection(view, left, right) {
  const selection = view.state.selection.main;
  const selected = view.state.sliceDoc(selection.from, selection.to);
  const insert = `${left}${selected}${right}`;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: {
      anchor: selection.from + left.length,
      head: selection.from + left.length + selected.length,
    },
  });
  view.focus();
}

function formatSelection(view, format) {
  if (format === "bold") return replaceSelection(view, "**", "**");
  if (format === "italic") return replaceSelection(view, "*", "*");
  if (format === "inlineMath") return replaceSelection(view, "$", "$");
  if (format === "displayMath") return replaceSelection(view, "$$\n", "\n$$");
  if (format === "code") return replaceSelection(view, "`", "`");
  if (format !== "bullet") return undefined;

  const selection = view.state.selection.main;
  const firstLine = view.state.doc.lineAt(selection.from);
  const lastLine = view.state.doc.lineAt(selection.to);
  const original = view.state.sliceDoc(firstLine.from, lastLine.to);
  const insert = original.split("\n").map((line) => (line.startsWith("- ") ? line : `- ${line}`)).join("\n");
  view.dispatch({
    changes: { from: firstLine.from, to: lastLine.to, insert },
    selection: { anchor: firstLine.from + insert.length },
  });
  view.focus();
  return true;
}

function createEditor({ parent, onChange, onSave, onBlur }) {
  let suppressChange = false;
  let view;
  const saveBinding = { key: "Mod-s", run: () => { onSave?.(); return true; } };
  const startState = EditorState.create({
    doc: "",
    extensions: [
      history(),
      drawSelection(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      markdown(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      autocompletion({ override: [latexCompletionSource], activateOnTyping: true }),
      keymap.of([saveBinding, indentWithTab, ...completionKeymap, ...defaultKeymap, ...historyKeymap]),
      placeholder("Capture the idea, question, or formula for this page…\n\nType \\ to suggest LaTeX symbols."),
      liveMath,
      liveMathInteraction,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (!suppressChange) onChange?.(update.state.doc.toString());
        const selection = update.state.selection.main;
        const beforeCursor = update.state.sliceDoc(0, selection.head);
        if (selection.empty && /\\[A-Za-z]*$/.test(beforeCursor)) startCompletion(update.view);
        else closeCompletion(update.view);
      }),
      EditorView.domEventHandlers({
        blur() {
          onBlur?.();
          return false;
        },
      }),
    ],
  });

  view = new EditorView({ state: startState, parent });
  return {
    getValue: () => view.state.doc.toString(),
    setValue(value) {
      const next = value || "";
      if (next === view.state.doc.toString()) return;
      suppressChange = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: 0 },
      });
      suppressChange = false;
    },
    applyFormat(format) {
      return formatSelection(view, format);
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}

window.MarginEditor = { create: createEditor, parseMath };
