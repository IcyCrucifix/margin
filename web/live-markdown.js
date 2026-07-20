import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

const headingLevels = new Map([
  ["ATXHeading1", 1], ["SetextHeading1", 1],
  ["ATXHeading2", 2], ["SetextHeading2", 2],
  ["ATXHeading3", 3], ["ATXHeading4", 4],
  ["ATXHeading5", 5], ["ATXHeading6", 6],
]);

const hiddenMarkerNodes = new Set([
  "CodeInfo",
  "CodeMark",
  "EmphasisMark",
  "HeaderMark",
  "LinkMark",
  "QuoteMark",
]);

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-preview-list-bullet";
    bullet.textContent = "•";
    bullet.setAttribute("aria-hidden", "true");
    return bullet;
  }
}

function selectedLineNumbers(state, focused) {
  const lineNumbers = new Set();
  if (!focused) return lineNumbers;

  for (const range of state.selection.ranges) {
    const firstLine = state.doc.lineAt(range.from).number;
    const lastLine = state.doc.lineAt(range.to).number;
    for (let number = firstLine; number <= lastLine; number += 1) lineNumbers.add(number);
  }
  return lineNumbers;
}

function isActiveLine(state, activeLines, position) {
  return activeLines.has(state.doc.lineAt(Math.min(position, state.doc.length)).number);
}

function addLineClass(decorations, seenLineClasses, state, position, className) {
  const lineStart = state.doc.lineAt(Math.min(position, state.doc.length)).from;
  const key = `${lineStart}:${className}`;
  if (seenLineClasses.has(key)) return;
  seenLineClasses.add(key);
  decorations.push(Decoration.line({ class: className }).range(lineStart));
}

function addClassesToNodeLines(decorations, seenLineClasses, state, node, className) {
  const firstLine = state.doc.lineAt(node.from).number;
  const lastLine = state.doc.lineAt(node.to).number;
  for (let number = firstLine; number <= lastLine; number += 1) {
    addLineClass(decorations, seenLineClasses, state, state.doc.line(number).from, className);
  }
}

function sourceReplacement(from, to, widget) {
  return Decoration.replace({ livePreviewSource: true, widget }).range(from, to);
}

function markerEnd(state, node) {
  if (node.name !== "HeaderMark") return node.to;
  const lineEnd = state.doc.lineAt(node.to).to;
  let end = node.to;
  while (end < lineEnd && /[ \t]/.test(state.sliceDoc(end, end + 1))) end += 1;
  return end;
}

function shouldHideUrl(node) {
  const parentName = node.node.parent?.name;
  return parentName === "Link" || parentName === "Image";
}

function shouldHideLinkLabel(node) {
  return node.node.parent?.name === "Link";
}

function addNodeDecoration(decorations, seenLineClasses, state, activeLines, node) {
  const headingLevel = headingLevels.get(node.name);
  if (headingLevel) {
    addLineClass(
      decorations,
      seenLineClasses,
      state,
      node.from,
      `cm-preview-heading cm-preview-heading-${headingLevel}`,
    );
    return;
  }

  if (node.name === "Blockquote") {
    addClassesToNodeLines(decorations, seenLineClasses, state, node, "cm-preview-blockquote");
    return;
  }

  if (node.name === "CodeText") {
    addClassesToNodeLines(decorations, seenLineClasses, state, node, "cm-preview-code-block");
    return;
  }

  if (node.name === "InlineCode") {
    decorations.push(Decoration.mark({ class: "cm-preview-inline-code" }).range(node.from, node.to));
    return;
  }

  if (node.name === "HorizontalRule" && !isActiveLine(state, activeLines, node.from)) {
    addLineClass(decorations, seenLineClasses, state, node.from, "cm-preview-horizontal-rule");
    return;
  }

  if (isActiveLine(state, activeLines, node.from)) return;

  if (node.name === "ListMark") {
    const source = state.sliceDoc(node.from, node.to);
    if (["-", "+", "*"].includes(source)) {
      decorations.push(sourceReplacement(node.from, node.to, new BulletWidget()));
    }
    return;
  }

  if (hiddenMarkerNodes.has(node.name)
      || (node.name === "URL" && shouldHideUrl(node))
      || (node.name === "LinkLabel" && shouldHideLinkLabel(node))) {
    decorations.push(sourceReplacement(node.from, markerEnd(state, node)));
  }
}

export function liveMarkdownDecorations(state, focused) {
  const decorations = [];
  const seenLineClasses = new Set();
  const activeLines = selectedLineNumbers(state, focused);
  syntaxTree(state).iterate({
    enter: (node) => addNodeDecoration(decorations, seenLineClasses, state, activeLines, node),
  });
  return Decoration.set(decorations, true);
}

export const setLivePreviewFocused = StateEffect.define();

export const liveMarkdown = StateField.define({
  create: (state) => ({ focused: false, decorations: liveMarkdownDecorations(state, false) }),
  update(value, transaction) {
    let focused = value.focused;
    let focusChanged = false;
    for (const effect of transaction.effects) {
      if (effect.is(setLivePreviewFocused)) {
        focused = effect.value;
        focusChanged = focused !== value.focused;
      }
    }
    return transaction.docChanged || transaction.selection || focusChanged
      ? { focused, decorations: liveMarkdownDecorations(transaction.state, focused) }
      : value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});
