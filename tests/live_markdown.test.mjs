import assert from "node:assert/strict";
import test from "node:test";

import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";

import { liveMarkdownDecorations } from "../web/live-markdown.js";

function previewState(doc, anchor = 0) {
  return EditorState.create({ doc, selection: { anchor }, extensions: [markdown()] });
}

function decorationRecords(state, focused) {
  const records = [];
  liveMarkdownDecorations(state, focused).between(0, state.doc.length, (from, to, value) => {
    records.push({ from, to, spec: value.spec });
  });
  return records;
}

function hiddenSource(state, focused) {
  return decorationRecords(state, focused)
    .filter(({ spec }) => spec.livePreviewSource)
    .map(({ from, to }) => state.sliceDoc(from, to));
}

function lineClasses(state, focused) {
  return decorationRecords(state, focused)
    .map(({ spec }) => spec.class || "")
    .filter(Boolean);
}

test("hides heading source only away from the active line", () => {
  const doc = "# Active heading\n## Preview heading";
  const state = previewState(doc, 2);

  assert.deepEqual(hiddenSource(state, true), ["## "]);
  assert.deepEqual(hiddenSource(state, false), ["# ", "## "]);
  assert.ok(lineClasses(state, true).includes("cm-preview-heading cm-preview-heading-1"));
  assert.ok(lineClasses(state, true).includes("cm-preview-heading cm-preview-heading-2"));
});

test("reveals inline Markdown source on its active line", () => {
  const doc = "**active**\n*preview* and [link](https://example.com)";
  const state = previewState(doc, 3);

  assert.deepEqual(hiddenSource(state, true), ["*", "*", "[", "]", "(", "https://example.com", ")"]);
  assert.deepEqual(hiddenSource(state, false), ["**", "**", "*", "*", "[", "]", "(", "https://example.com", ")"]);
});

test("does not treat a hash inside a fenced code block as a heading", () => {
  const doc = "```md\n# source code\n```\n\n# Real heading";
  const state = previewState(doc, doc.length);
  const classes = lineClasses(state, true);

  assert.equal(classes.filter((className) => className.includes("cm-preview-heading")).length, 1);
  assert.ok(classes.includes("cm-preview-code-block"));
});
