import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";


async function loadBrowserModule(path) {
  const context = vm.createContext({ Intl, URLSearchParams });
  context.globalThis = context;
  vm.runInContext(await readFile(path, "utf8"), context, { filename: fileURLToPath(path) });
  return context;
}

test("builds a recursive tree and retains every alias path", async () => {
  const context = await loadBrowserModule(new URL("../web/folder-tree.js", import.meta.url));
  const documents = [{
    id: "a",
    filename: "lecture.pdf",
    title: "Lecture",
    course: "ELEC2441",
    lecture_date: "2026-08-03",
    kind: "pdf",
    import_paths: ["Semester/Week 1/lecture.pdf", "Semester/Review/lecture.pdf"],
  }, {
    id: "b",
    filename: "slides.pptx",
    title: "Slides",
    course: "ELEC2441",
    lecture_date: "2026-08-02",
    kind: "pptx",
  }];

  const tree = JSON.parse(JSON.stringify(context.MarginFolderTree.buildTree(documents)));
  assert.equal(context.MarginFolderTree.fileCount(tree), 3);
  assert.equal(tree.folders[0].name, "Semester");
  assert.deepEqual(tree.folders[0].folders.map(({ name }) => name), ["Review", "Week 1"]);
  assert.equal(tree.files[0].name, "slides.pptx");
});

test("folder-tree search matches path segments and prunes unrelated files", async () => {
  const context = await loadBrowserModule(new URL("../web/folder-tree.js", import.meta.url));
  const documents = [{
    id: "a",
    filename: "lecture.pdf",
    title: "Lecture",
    course: "ELEC2441",
    lecture_date: "2026-08-03",
    kind: "pdf",
    import_paths: ["Semester/Week 1/lecture.pdf", "Semester/Review/lecture.pdf"],
  }];

  const tree = context.MarginFolderTree.buildTree(documents, "review");
  assert.equal(context.MarginFolderTree.fileCount(tree), 1);
  assert.equal(tree.folders[0].folders[0].name, "Review");
});

test("prefers canonical library paths while retaining old records", async () => {
  const context = await loadBrowserModule(new URL("../web/folder-tree.js", import.meta.url));
  const current = { filename: "new.pdf", library_paths: ["Current/new.pdf"], import_paths: ["Old/new.pdf"] };
  const legacy = { filename: "old.pdf", import_paths: ["Legacy/old.pdf"] };

  assert.deepEqual([...context.MarginFolderTree.libraryPaths(current)], ["Current/new.pdf"]);
  assert.deepEqual([...context.MarginFolderTree.libraryPaths(legacy)], ["Legacy/old.pdf"]);
});
