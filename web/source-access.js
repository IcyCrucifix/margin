(() => {
  let receiveSelection = async () => {};

  function nativeBridge() {
    return globalThis.webkit?.messageHandlers?.margin;
  }

  function requestBody(options, payload) {
    return options.mutationOptions({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  function initialize(options) {
    const { elements } = options;
    let selection = null;
    let busy = false;

    async function inspect(paths) {
      const result = await options.request(
        "/api/source-access/inspect",
        requestBody(options, { paths }),
      );
      prepare(result.selection);
    }

    async function choose() {
      if (!options.hasSession() || busy) return;
      if (nativeBridge()) {
        nativeBridge().postMessage({ action: "chooseSource" });
        return;
      }
      busy = true;
      try {
        const result = await options.request(
          "/api/source-picker",
          requestBody(options, {}),
        );
        if (!result.cancelled) prepare(result.selection);
      } catch (error) {
        options.showToast(error.message, true, 7000);
      } finally {
        busy = false;
      }
    }

    function prepare(next) {
      if (!next?.sources?.length) return;
      selection = next;
      if (next.kind === "folder") {
        elements.folderName.textContent = next.name;
        elements.folderSummary.textContent = options.t("folder.summary", {
          count: next.sources.length,
          skipped: next.skipped_count,
        });
        elements.folderCourse.value = next.name;
        elements.folderDialog.showModal();
        return;
      }
      const source = next.sources[0];
      elements.fileKind.textContent = source.filename.split(".").pop().toUpperCase();
      elements.fileName.textContent = source.filename;
      elements.fileSize.textContent = `${(source.size / 1024 / 1024).toFixed(source.size > 10_000_000 ? 1 : 2)} MB`;
      elements.fileCourse.value = "";
      elements.fileTitle.value = source.title;
      elements.fileDate.value = source.lecture_date;
      elements.fileDialog.showModal();
    }

    async function addSource(source, metadata) {
      return options.request("/api/library/access", requestBody(options, {
        ...source,
        ...metadata,
        polished_note_language: options.defaultNoteLanguage(),
      }));
    }

    async function submitFile(event) {
      event.preventDefault();
      if (event.submitter?.value === "cancel") return close(elements.fileDialog);
      if (busy || selection?.kind !== "file" || !elements.fileForm.reportValidity()) return;
      busy = true;
      elements.fileSubmit.disabled = true;
      elements.fileSubmit.textContent = options.t("access.reading_pages");
      try {
        const result = await addSource(selection.sources[0], {
          course: elements.fileCourse.value,
          title: elements.fileTitle.value,
          date: elements.fileDate.value,
        });
        close(elements.fileDialog);
        options.showToast(options.t("access.ready", { title: result.document.title }));
        await options.onAccessed(result.document.id);
      } catch (error) {
        options.showToast(error.message, true, 7000);
      } finally {
        busy = false;
        elements.fileSubmit.disabled = false;
        elements.fileSubmit.textContent = options.t("access.submit");
      }
    }

    async function submitFolder(event) {
      event.preventDefault();
      if (event.submitter?.value === "cancel") return close(elements.folderDialog);
      if (busy || selection?.kind !== "folder" || !elements.folderForm.reportValidity()) return;
      busy = true;
      elements.folderSubmit.disabled = true;
      elements.folderCancel.disabled = true;
      elements.folderProgress.hidden = false;
      const failures = [];
      let completed = 0;
      let lastId = null;
      for (const [index, source] of selection.sources.entries()) {
        elements.folderProgress.textContent = options.t("access.progress", {
          current: index + 1, total: selection.sources.length, filename: source.filename,
        });
        try {
          const result = await addSource(source, {
            course: elements.folderCourse.value,
            title: source.title,
            date: source.lecture_date,
          });
          completed += 1;
          lastId = result.document.id;
        } catch (error) {
          failures.push(`${source.filename}: ${error.message}`);
        }
      }
      busy = false;
      close(elements.folderDialog);
      elements.folderSubmit.disabled = false;
      elements.folderCancel.disabled = false;
      elements.folderProgress.hidden = true;
      if (completed) await options.onAccessed(lastId);
      options.showToast(
        failures.length
          ? options.t("access.partial", { completed, failed: failures.length, reason: failures[0] })
          : options.t("access.folder_ready", { count: completed }),
        Boolean(failures),
        failures.length ? 9000 : 6500,
      );
    }

    function close(dialog) {
      dialog.close();
      selection = null;
    }

    receiveSelection = async ({ paths }) => {
      try {
        await inspect(paths);
      } catch (error) {
        options.showToast(error.message, true, 7000);
      }
    };
    elements.buttons.forEach((button) => button.addEventListener("click", choose));
    elements.fileForm.addEventListener("submit", submitFile);
    elements.folderForm.addEventListener("submit", submitFolder);
  }

  globalThis.MarginSourceAccess = Object.freeze({
    initialize,
    receiveNativeSelection: (payload) => receiveSelection(payload),
  });
})();
