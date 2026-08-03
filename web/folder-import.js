(() => {
  const supportedExtensions = new Set(["pdf", "pptx"]);

  function extensionFor(file) {
    return file.name.split(".").pop()?.toLocaleLowerCase() || "";
  }

  function importPathFor(file) {
    return file.webkitRelativePath || file.name;
  }

  function filesForImport(fileList) {
    return [...fileList]
      .filter((file) => supportedExtensions.has(extensionFor(file)))
      .sort((left, right) => importPathFor(left).localeCompare(importPathFor(right), undefined, {
        numeric: true,
        sensitivity: "base",
      }));
  }

  function titleFor(file) {
    return file.name.replace(/\.(pdf|pptx)$/i, "").replace(/[_-]+/g, " ");
  }

  function dateFor(file) {
    const modified = new Date(file.lastModified || Date.now());
    const valid = Number.isNaN(modified.getTime()) ? new Date() : modified;
    const local = new Date(valid.getTime() - valid.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  }

  function rootNameFor(files) {
    const path = files[0] ? importPathFor(files[0]).replaceAll("\\", "/") : "";
    const parts = path.split("/").filter(Boolean);
    return parts.length > 1 ? parts[0] : "Unsorted";
  }

  function initialize(options) {
    const elements = options.elements;
    let selectedFiles = [];
    let isImporting = false;

    function reset() {
      selectedFiles = [];
      elements.input.value = "";
      elements.progress.hidden = true;
      elements.submit.disabled = false;
      elements.cancel.disabled = false;
      elements.submit.textContent = options.t("folder.submit");
    }

    function prepare() {
      if (!options.hasSession()) return reset();
      const allFiles = [...elements.input.files];
      selectedFiles = filesForImport(allFiles);
      if (!selectedFiles.length) {
        options.showToast(options.t("folder.no_supported"), true);
        reset();
        return;
      }
      const rootName = rootNameFor(selectedFiles);
      elements.name.textContent = rootName;
      elements.summary.textContent = options.t("folder.summary", {
        count: selectedFiles.length,
        skipped: allFiles.length - selectedFiles.length,
      });
      elements.course.value = rootName;
      elements.dialog.showModal();
    }

    async function submit(event) {
      event.preventDefault();
      if (event.submitter?.value === "cancel") {
        elements.dialog.close();
        reset();
        return;
      }
      if (isImporting || !selectedFiles.length || !elements.form.reportValidity()) return;
      isImporting = true;
      elements.submit.disabled = true;
      elements.cancel.disabled = true;
      elements.progress.hidden = false;
      const failures = [];
      let completed = 0;
      let lastDocumentId = null;

      for (const [index, file] of selectedFiles.entries()) {
        elements.progress.textContent = options.t("folder.progress", {
          current: index + 1,
          total: selectedFiles.length,
          filename: file.name,
        });
        const params = new URLSearchParams({
          filename: file.name,
          import_path: importPathFor(file),
          course: elements.course.value,
          title: titleFor(file),
          date: dateFor(file),
          polished_note_language: options.defaultNoteLanguage(),
        });
        try {
          const result = await options.request(
            `/api/import?${params}`,
            options.mutationOptions({ method: "POST", body: file }),
          );
          completed += 1;
          lastDocumentId = result.document.id;
        } catch (error) {
          failures.push(`${file.name}: ${error.message}`);
        }
      }

      isImporting = false;
      elements.dialog.close();
      reset();
      if (completed) await options.onImported(lastDocumentId);
      if (failures.length) {
        options.showToast(options.t("folder.partial", {
          completed,
          failed: failures.length,
          reason: failures[0],
        }), true, 9000);
      } else {
        options.showToast(options.t("folder.ready", { count: completed }), false, 6500);
      }
    }

    elements.button.addEventListener("click", () => elements.input.click());
    elements.input.addEventListener("change", prepare);
    elements.form.addEventListener("submit", submit);
    elements.dialog.addEventListener("cancel", (event) => {
      if (isImporting) event.preventDefault();
    });
    elements.dialog.addEventListener("close", () => {
      if (!isImporting) reset();
    });
  }

  globalThis.MarginFolderImport = Object.freeze({
    dateFor,
    filesForImport,
    importPathFor,
    initialize,
    rootNameFor,
    titleFor,
  });
})();
