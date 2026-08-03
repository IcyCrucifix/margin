(() => {
  const expandedPaths = new Set();
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  function importPaths(document) {
    const stored = Array.isArray(document.import_paths) ? document.import_paths : [];
    const paths = stored.filter((path) => typeof path === "string" && path.trim());
    return [...new Set(paths.length ? paths : [document.filename || document.title])];
  }

  function newFolder(name = "", path = "") {
    return { kind: "folder", name, path, folders: new Map(), files: [] };
  }

  function matches(document, path, query) {
    if (!query) return true;
    return `${path} ${document.course} ${document.title} ${document.lecture_date}`
      .toLocaleLowerCase()
      .includes(query);
  }

  function buildTree(documents, search = "") {
    const query = search.trim().toLocaleLowerCase();
    const root = newFolder();
    documents.forEach((document) => {
      importPaths(document).forEach((path) => {
        if (!matches(document, path, query)) return;
        const parts = path.replaceAll("\\", "/").split("/").filter(Boolean);
        if (!parts.length) return;
        let parent = root;
        parts.slice(0, -1).forEach((name) => {
          const folderPath = parent.path ? `${parent.path}/${name}` : name;
          if (!parent.folders.has(name)) parent.folders.set(name, newFolder(name, folderPath));
          parent = parent.folders.get(name);
        });
        parent.files.push({
          kind: "file",
          name: parts.at(-1),
          path: parts.join("/"),
          document,
        });
      });
    });
    return finalizeFolder(root);
  }

  function finalizeFolder(folder) {
    return {
      kind: "folder",
      name: folder.name,
      path: folder.path,
      folders: [...folder.folders.values()]
        .sort((left, right) => collator.compare(left.name, right.name))
        .map(finalizeFolder),
      files: folder.files.sort((left, right) => collator.compare(left.name, right.name)),
    };
  }

  function fileCount(folder) {
    return folder.files.length + folder.folders.reduce((sum, child) => sum + fileCount(child), 0);
  }

  function renderFile(entry, depth, options) {
    const button = document.createElement("button");
    const lecture = entry.document;
    button.type = "button";
    button.className = `lecture-card file-tree-file${options.activeId === lecture.id ? " active" : ""}`;
    button.style.setProperty("--tree-depth", String(depth));
    button.title = entry.path;

    const icon = document.createElement("span");
    icon.className = "lecture-icon";
    icon.textContent = lecture.kind.toUpperCase();
    const copy = document.createElement("span");
    copy.className = "lecture-copy";
    const name = document.createElement("strong");
    name.textContent = entry.name;
    const metadata = document.createElement("span");
    metadata.textContent = `${lecture.course} · ${options.formatDate(lecture.lecture_date)}`;
    copy.append(name, metadata);
    const note = document.createElement("i");
    note.className = `note-pip${lecture.has_notes ? " has-notes" : ""}`;
    button.append(icon, copy, note);
    button.addEventListener("click", () => options.onSelect(lecture.id));
    return button;
  }

  function renderFolder(folder, depth, options) {
    const section = document.createElement("section");
    section.className = "file-tree-folder";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-tree-folder-button";
    button.style.setProperty("--tree-depth", String(depth));

    const isExpanded = options.expandAll || depth === 0 || expandedPaths.has(folder.path);
    const children = document.createElement("div");
    children.className = "file-tree-children";
    children.hidden = !isExpanded;
    button.setAttribute("aria-expanded", String(isExpanded));
    button.innerHTML = '<span class="file-tree-chevron" aria-hidden="true">›</span><span class="file-tree-folder-icon" aria-hidden="true">▰</span><strong></strong><small></small>';
    button.querySelector("strong").textContent = folder.name;
    button.querySelector("small").textContent = String(fileCount(folder));
    button.addEventListener("click", () => {
      const next = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(next));
      children.hidden = !next;
      if (next) expandedPaths.add(folder.path);
      else expandedPaths.delete(folder.path);
    });

    folder.folders.forEach((child) => children.append(renderFolder(child, depth + 1, options)));
    folder.files.forEach((file) => children.append(renderFile(file, depth + 1, options)));
    section.append(button, children);
    return section;
  }

  function render(container, tree, options) {
    container.replaceChildren();
    tree.folders.forEach((folder) => container.append(renderFolder(folder, 0, options)));
    tree.files.forEach((file) => container.append(renderFile(file, 0, options)));
    return fileCount(tree);
  }

  globalThis.MarginFolderTree = Object.freeze({ buildTree, fileCount, importPaths, render });
})();
