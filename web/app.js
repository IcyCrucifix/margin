const state = {
  documents: [],
  active: null,
  page: 1,
  notes: {},
  zoom: 1,
  pendingFile: null,
  saveTimer: null,
  savedValue: "",
  jobPoll: null,
  batchRunning: false,
  health: null,
  loadingTimer: null,
  preloadedPages: new Set(),
  renderRevision: 0,
  editor: null,
  polishPrompts: null,
  polishPromptScope: "selected",
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  openFileButton: $("#openFileButton"), emptyOpenButton: $("#emptyOpenButton"), fileInput: $("#fileInput"),
  polishPendingButton: $("#polishPendingButton"), autoPolishStatus: $("#autoPolishStatus"),
  librarySearch: $("#librarySearch"), lectureList: $("#lectureList"), lectureCount: $("#lectureCount"),
  vaultStatusCard: $("#vaultStatusCard"), vaultStatusText: $("#vaultStatusText"), vaultLabel: $("#vaultLabel"),
  vaultProof: $("#vaultProof"), courseLabel: $("#courseLabel"), documentTitle: $("#documentTitle"),
  pageCounter: $("#pageCounter"), currentPageLabel: $("#currentPageLabel"), totalPagesLabel: $("#totalPagesLabel"),
  previousPage: $("#previousPage"), nextPage: $("#nextPage"), polishButton: $("#polishButton"),
  emptyState: $("#emptyState"), readerLayout: $("#readerLayout"), pageList: $("#pageList"),
  pageKindLabel: $("#pageKindLabel"), reloadFileButton: $("#reloadFileButton"), pageStrip: $(".page-strip"), pageStage: $("#pageStage"), pageCanvas: $("#pageCanvas"),
  pageImage: $("#pageImage"), pageLoading: $("#pageLoading"),
  zoomOut: $("#zoomOut"), zoomIn: $("#zoomIn"), zoomLabel: $("#zoomLabel"),
  memoTitle: $("#memoTitle"), saveState: $("#saveState"), noteEditor: $("#noteEditor"),
  importDialog: $("#importDialog"),
  importForm: $("#importForm"), importFileKind: $("#importFileKind"), importFileName: $("#importFileName"),
  importFileSize: $("#importFileSize"), importCourse: $("#importCourse"), importTitle: $("#importTitle"),
  importDate: $("#importDate"), importSubmit: $("#importSubmit"), toast: $("#toast"),
  polishDialog: $("#polishDialog"), polishDialogTitle: $("#polishDialogTitle"),
  polishAvailabilityMessage: $("#polishAvailabilityMessage"), polishRunnerReason: $("#polishRunnerReason"),
  directPolishButton: $("#directPolishButton"), copyManualPromptButton: $("#copyManualPromptButton"),
  copyNightlyPromptButton: $("#copyNightlyPromptButton"),
};

async function api(path, options = {}) {
  const response = await fetch(path, options);
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function mutateOptions(options = {}) {
  return { ...options, headers: { "X-Content-Reader": "1", ...(options.headers || {}) } };
}

function showToast(message, error = false, duration = 4200) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", error);
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, duration);
}

async function loadLibrary(preferredId = null) {
  const [{ documents }] = await Promise.all([api("/api/library"), checkVaultConnection()]);
  state.documents = documents;
  renderLibrary();
  const id = preferredId || state.active?.id;
  const chosen = id && documents.find((item) => item.id === id);
  if (chosen) await selectDocument(chosen.id, false);
}

async function checkVaultConnection() {
  elements.vaultStatusCard.classList.remove("connected", "disconnected");
  elements.vaultStatusCard.classList.add("checking");
  elements.vaultStatusText.textContent = "Checking notes storage…";
  elements.vaultProof.textContent = "Testing read and write access";
  try {
    const health = await api("/api/health");
    state.health = health;
    const isObsidian = health.storage_mode === "obsidian";
    elements.vaultLabel.textContent = `${health.root_name || health.vault_name || "Configured folder"} · ${health.storage_label || "Notes folder"}`;
    elements.vaultStatusCard.title = `${health.root_path || health.vault_path}\n${health.reason}\nClick to verify again`;
    if (!state.batchRunning) {
      elements.autoPolishStatus.textContent = health.automation?.enabled
        ? `Automatic · daily at ${health.automation.daily_at}`
        : "Manual batch";
    }
    elements.vaultStatusCard.classList.remove("checking");
    if (health.connected) {
      elements.vaultStatusCard.classList.add("connected");
      elements.vaultStatusText.textContent = isObsidian ? "Obsidian verified" : "Notes folder verified";
      elements.vaultProof.textContent = `${isObsidian ? "Vault detected" : "Folder ready"} · Read/write passed · just now`;
    } else {
      elements.vaultStatusCard.classList.add("disconnected");
      elements.vaultStatusText.textContent = isObsidian ? "Obsidian unavailable" : "Notes folder unavailable";
      elements.vaultProof.textContent = health.reason || "Storage verification failed";
    }
    return health;
  } catch (error) {
    elements.vaultStatusCard.classList.remove("checking");
    elements.vaultStatusCard.classList.add("disconnected");
    elements.vaultStatusText.textContent = "Local service unavailable";
    elements.vaultProof.textContent = "Click to check again";
    elements.vaultStatusCard.title = error.message;
    return { connected: false, reason: error.message };
  }
}

function renderLibrary() {
  const query = elements.librarySearch.value.trim().toLowerCase();
  const visible = state.documents.filter((doc) => `${doc.course} ${doc.title} ${doc.lecture_date}`.toLowerCase().includes(query));
  elements.lectureCount.textContent = String(state.documents.length);
  const pendingCount = state.documents.filter((doc) => doc.has_notes && !doc.polished_current).length;
  elements.polishPendingButton.disabled = state.batchRunning || pendingCount === 0;
  if (!state.batchRunning && !state.health?.automation?.enabled) {
    elements.autoPolishStatus.textContent = pendingCount ? `${pendingCount} lecture${pendingCount === 1 ? "" : "s"} ready` : "Nothing pending";
  }
  elements.lectureList.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "library-empty";
    empty.textContent = state.documents.length ? "No matching lectures." : "Your imported lectures will appear here.";
    elements.lectureList.append(empty);
    return;
  }
  visible.forEach((doc) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `lecture-card${state.active?.id === doc.id ? " active" : ""}`;
    button.innerHTML = `<span class="lecture-icon">${doc.kind.toUpperCase()}</span><span><strong></strong><span></span></span><i class="note-pip${doc.has_notes ? " has-notes" : ""}"></i>`;
    button.querySelector("strong").textContent = doc.title;
    button.querySelectorAll(":scope > span")[1].querySelector("span").textContent = `${doc.course} · ${formatDate(doc.lecture_date)}`;
    button.addEventListener("click", () => selectDocument(doc.id));
    elements.lectureList.append(button);
  });
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value || "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

async function selectDocument(id, saveFirst = true) {
  if (saveFirst) await saveNow();
  const doc = state.documents.find((item) => item.id === id);
  if (!doc) return;
  const { notes } = await api(`/api/doc/${id}/notes`);
  state.active = doc;
  state.notes = notes;
  state.page = 1;
  state.zoom = 1;
  state.preloadedPages.clear();
  elements.emptyState.hidden = true;
  elements.readerLayout.hidden = false;
  elements.pageCounter.hidden = false;
  elements.courseLabel.textContent = `${doc.course} · ${doc.kind.toUpperCase()}`;
  elements.documentTitle.textContent = doc.title;
  elements.totalPagesLabel.textContent = String(doc.page_count);
  elements.polishButton.disabled = state.batchRunning || !doc.has_notes;
  elements.polishButton.classList.toggle("is-current", Boolean(doc.polished_current));
  elements.polishButton.querySelector("span:last-child").lastChild.textContent = doc.polished_current ? "Up to date" : "Polish now";
  renderLibrary();
  renderPageList();
  renderPage();
}

function renderPageList() {
  elements.pageList.replaceChildren();
  if (!state.active) return;
  for (let page = 1; page <= state.active.page_count; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-tile${page === state.page ? " active" : ""}`;
    button.dataset.page = String(page);
    button.setAttribute("aria-label", `Page ${page}`);
    button.innerHTML = `<span class="page-thumb-frame"><img class="page-thumb" alt="" loading="lazy" decoding="async" fetchpriority="low"></span><span class="page-tile-footer">${page}</span><span class="page-note-dot${state.notes[String(page)]?.trim() ? " visible" : ""}"></span>`;
    const thumbnail = button.querySelector(".page-thumb");
    thumbnail.addEventListener("load", () => button.classList.add("thumbnail-ready"), { once: true });
    thumbnail.addEventListener("error", () => { thumbnail.hidden = true; }, { once: true });
    thumbnail.src = thumbnailImageUrl(page);
    button.addEventListener("click", () => goToPage(page));
    elements.pageList.append(button);
  }
  updatePageListState();
}

function updatePageListState() {
  elements.pageList.querySelector(".page-tile.active")?.classList.remove("active");
  const active = elements.pageList.querySelector(`[data-page="${state.page}"]`);
  active?.classList.add("active");
  if (!active) return;
  const listBounds = elements.pageList.getBoundingClientRect();
  const activeBounds = active.getBoundingClientRect();
  let target = null;
  if (activeBounds.top < listBounds.top) {
    target = elements.pageList.scrollTop + activeBounds.top - listBounds.top - 10;
  } else if (activeBounds.bottom > listBounds.bottom) {
    target = elements.pageList.scrollTop + activeBounds.bottom - listBounds.bottom + 10;
  }
  if (target !== null) elements.pageList.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
}

function updateCurrentPageNoteDot() {
  const tile = elements.pageList.querySelector(`[data-page="${state.page}"]`);
  tile?.querySelector(".page-note-dot")?.classList.toggle("visible", Boolean(state.notes[String(state.page)]?.trim()));
}

function pageImageUrl(page) {
  return `/api/doc/${state.active.id}/page/${page}?reload=${state.renderRevision}`;
}

function thumbnailImageUrl(page) {
  return `/api/doc/${state.active.id}/thumbnail/${page}?reload=${state.renderRevision}`;
}

function preloadNearbyPages(page) {
  if (!state.active) return;
  const documentId = state.active.id;
  const candidates = [page + 1, page - 1, page + 2, page - 2]
    .filter((candidate) => candidate >= 1 && candidate <= state.active.page_count);
  const preload = () => {
    candidates.forEach((candidate) => {
      const key = `${documentId}:${candidate}`;
      if (state.preloadedPages.has(key)) return;
      state.preloadedPages.add(key);
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = `/api/doc/${documentId}/page/${candidate}?reload=${state.renderRevision}`;
    });
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(preload, { timeout: 400 });
  else setTimeout(preload, 0);
}

function renderPage() {
  if (!state.active) return;
  const page = state.page;
  elements.currentPageLabel.textContent = String(page);
  elements.pageKindLabel.textContent = `${state.active.kind === "pptx" ? "SLIDE" : "PAGE"} ${page}`;
  elements.memoTitle.textContent = `Notes for ${state.active.kind === "pptx" ? "slide" : "page"} ${page}`;
  elements.previousPage.disabled = page === 1;
  elements.nextPage.disabled = page === state.active.page_count;
  state.editor.setValue(state.notes[String(page)] || "");
  state.savedValue = state.editor.getValue();
  setSaveState("saved", "Saved");
  clearTimeout(state.loadingTimer);
  elements.pageLoading.textContent = "Rendering page…";
  elements.pageLoading.hidden = true;
  elements.pageImage.style.visibility = "hidden";
  elements.pageImage.fetchPriority = "high";
  elements.pageImage.onload = () => {
    clearTimeout(state.loadingTimer);
    elements.pageLoading.hidden = true;
    elements.pageImage.style.visibility = "visible";
    applyZoom();
    preloadNearbyPages(page);
  };
  elements.pageImage.onerror = () => {
    clearTimeout(state.loadingTimer);
    elements.pageLoading.textContent = "Could not render this page. Use Reload file to retry.";
    elements.pageLoading.hidden = false;
  };
  state.loadingTimer = setTimeout(() => { elements.pageLoading.hidden = false; }, 140);
  elements.pageImage.src = pageImageUrl(page);
  updatePageListState();
}

async function reloadFile() {
  if (!state.active) return;
  const currentValue = state.editor?.getValue() || "";
  await saveNow();
  if (state.savedValue !== currentValue) {
    showToast("The file was not reloaded because the current page memo could not be saved.", true, 6500);
    return;
  }
  elements.reloadFileButton.disabled = true;
  state.renderRevision = Date.now();
  state.preloadedPages.clear();
  renderPageList();
  renderPage();
  elements.reloadFileButton.disabled = false;
  showToast("File reloaded. Page notes stayed assigned.");
}

async function goToPage(page) {
  if (!state.active || page < 1 || page > state.active.page_count || page === state.page) return;
  await saveNow();
  state.page = page;
  renderPage();
}

function setSaveState(kind, text) {
  elements.saveState.className = `save-state${kind === "saved" ? "" : ` ${kind}`}`;
  elements.saveState.lastChild.textContent = ` ${text}`;
}

function queueSave(value = state.editor?.getValue() || "") {
  if (!state.active) return;
  state.notes[String(state.page)] = value;
  setSaveState("saving", "Unsaved");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNow, 650);
  updateCurrentPageNoteDot();
}

async function saveNow() {
  clearTimeout(state.saveTimer);
  const currentValue = state.editor?.getValue() || "";
  if (!state.active || currentValue === state.savedValue) return;
  const documentId = state.active.id;
  const page = state.page;
  const content = currentValue;
  setSaveState("saving", "Saving…");
  try {
    const result = await api(`/api/doc/${documentId}/note`, mutateOptions({
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, content }),
    }));
    if (state.active?.id === documentId && state.page === page && state.editor.getValue() === content) {
      state.savedValue = content;
      setSaveState("saved", "Saved");
    }
    const doc = state.documents.find((item) => item.id === documentId);
    if (doc) {
      doc.has_notes = Object.values(state.notes).some((value) => value.trim());
      doc.polished_current = false;
      elements.polishButton.disabled = state.batchRunning || !doc.has_notes;
      elements.polishButton.classList.remove("is-current");
      elements.polishButton.querySelector("span:last-child").lastChild.textContent = "Polish now";
      elements.polishPendingButton.disabled = state.batchRunning
        || !state.documents.some((item) => item.has_notes && !item.polished_current);
    }
    return result;
  } catch (error) {
    setSaveState("error", "Save failed");
    showToast(error.message, true);
  }
}

function applyZoom() {
  elements.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  const available = Math.max(320, elements.pageCanvas.clientWidth - 50);
  elements.pageImage.style.width = `${available * state.zoom}px`;
}

function chooseFile(file) {
  if (!file) return;
  const extension = file.name.split(".").pop().toLowerCase();
  if (!["pdf", "pptx"].includes(extension)) return showToast("Choose a PDF or PPTX file.", true);
  state.pendingFile = file;
  elements.importFileKind.textContent = extension.toUpperCase();
  elements.importFileName.textContent = file.name;
  elements.importFileSize.textContent = `${(file.size / 1024 / 1024).toFixed(file.size > 10_000_000 ? 1 : 2)} MB`;
  elements.importTitle.value = file.name.replace(/\.(pdf|pptx)$/i, "").replace(/[_-]+/g, " ");
  elements.importDate.value = new Date().toLocaleDateString("en-CA");
  elements.importDialog.showModal();
}

async function importLecture(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    elements.importDialog.close();
    state.pendingFile = null;
    elements.fileInput.value = "";
    return;
  }
  if (!state.pendingFile || !elements.importForm.reportValidity()) return;
  const params = new URLSearchParams({
    filename: state.pendingFile.name, course: elements.importCourse.value, title: elements.importTitle.value, date: elements.importDate.value,
  });
  elements.importSubmit.disabled = true;
  elements.importSubmit.textContent = "Reading pages…";
  try {
    const { document } = await api(`/api/import?${params}`, mutateOptions({ method: "POST", body: state.pendingFile }));
    elements.importDialog.close();
    showToast(`${document.title} is ready. Raw notes are linked in your notes workspace.`);
    state.pendingFile = null;
    elements.fileInput.value = "";
    await loadLibrary(document.id);
  } catch (error) {
    showToast(error.message, true, 7000);
  } finally {
    elements.importSubmit.disabled = false;
    elements.importSubmit.textContent = "Import lecture";
  }
}

function formatSelection(button) {
  state.editor?.applyFormat(button.dataset.format);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.append(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  if (!copied) throw new Error("Your browser blocked clipboard access.");
}

async function copyPolishPrompt(kind, button) {
  const prompt = state.polishPrompts?.[kind];
  if (!prompt) return showToast("The prompt is not ready yet.", true);
  const original = button.textContent;
  try {
    await copyText(prompt);
    button.textContent = "Copied";
    showToast("Prompt copied. Paste it into your AI or automation task.");
    setTimeout(() => { button.textContent = original; }, 1800);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function openPolishOptions(scope = "selected", directFailure = "") {
  if (scope === "selected" && !state.active) return;
  await saveNow();
  elements.polishButton.disabled = true;
  elements.polishPendingButton.disabled = true;
  try {
    const params = new URLSearchParams({ scope });
    if (scope === "selected") params.set("document_id", state.active.id);
    const result = await api(`/api/polish/prompts?${params}`);
    state.polishPrompts = {
      manual: result.manual_prompt,
      nightly: result.nightly_prompt,
    };
    state.polishPromptScope = scope;
    const available = Boolean(result.runner?.available) && !directFailure;
    elements.polishDialogTitle.textContent = scope === "selected"
      ? "Stage 2 options"
      : "Polish pending lectures";
    elements.directPolishButton.textContent = scope === "selected"
      ? "Polish this lecture in Margin"
      : "Polish pending in Margin";
    elements.directPolishButton.disabled = !available;
    elements.copyManualPromptButton.textContent = scope === "selected"
      ? "Copy one-time polish prompt"
      : "Copy pending-batch prompt";
    elements.copyNightlyPromptButton.textContent = "Copy nightly automation prompt";
    if (available) {
      elements.polishAvailabilityMessage.textContent = `${result.runner.label} is ready for direct polishing.`;
      elements.polishRunnerReason.textContent = "Run Stage 2 here, or copy a hidden prompt for another AI system.";
      elements.polishRunnerReason.classList.remove("error");
    } else {
      elements.polishAvailabilityMessage.textContent = result.runner?.message
        || "Direct manual polishing is unavailable. You may copy one of the prompts below into your AI automation to activate your own polishing system.";
      elements.polishRunnerReason.textContent = directFailure || result.runner?.reason || "No direct AI runner is connected.";
      elements.polishRunnerReason.classList.add("error");
    }
    elements.polishDialog.showModal();
  } catch (error) {
    showToast(error.message, true, 7000);
  } finally {
    renderLibrary();
    if (state.active) {
      elements.polishButton.disabled = state.batchRunning || !state.active.has_notes;
    }
  }
}

async function runDirectPolish() {
  elements.polishDialog.close();
  if (state.polishPromptScope === "pending") await polishPendingDirect();
  else await polishNowDirect();
}

async function polishNowDirect() {
  if (!state.active) return;
  await saveNow();
  elements.polishButton.disabled = true;
  elements.polishButton.querySelector("span:last-child").lastChild.textContent = "Starting…";
  try {
    const result = await api(`/api/doc/${state.active.id}/polish`, mutateOptions({ method: "POST" }));
    if (result.status === "skipped") {
      showToast(result.message);
      await loadLibrary(state.active.id);
      return;
    }
    if (result.status === "unavailable") {
      await openPolishOptions("selected", result.reason || result.message);
      return;
    }
    showToast("Stage 2 is running. You can keep taking notes; changed inputs will be protected.", false, 6500);
    pollJob(result.id, result.kind === "batch");
  } catch (error) {
    elements.polishButton.disabled = false;
    elements.polishButton.querySelector("span:last-child").lastChild.textContent = "Polish now";
    showToast(error.message, true, 7000);
  }
}

async function polishPendingDirect() {
  await saveNow();
  state.batchRunning = true;
  elements.polishPendingButton.disabled = true;
  elements.polishButton.disabled = true;
  elements.autoPolishStatus.textContent = "Starting…";
  try {
    const result = await api("/api/polish/pending", mutateOptions({ method: "POST" }));
    if (result.status === "skipped") {
      state.batchRunning = false;
      showToast(result.message);
      await loadLibrary(state.active?.id);
      return;
    }
    if (result.status === "unavailable") {
      state.batchRunning = false;
      await openPolishOptions("pending", result.reason || result.message);
      return;
    }
    showToast("Polishing pending lectures one at a time. You can keep using Margin.", false, 6500);
    pollJob(result.id, true);
  } catch (error) {
    state.batchRunning = false;
    elements.autoPolishStatus.textContent = "Manual batch";
    renderLibrary();
    showToast(error.message, true, 7000);
  }
}

function pollJob(jobId, batch = false) {
  clearTimeout(state.jobPoll);
  state.jobPoll = setTimeout(async () => {
    try {
      const job = await api(`/api/jobs/${jobId}`);
      if (job.status === "running") {
        if (batch || job.kind === "batch") {
          state.batchRunning = true;
          elements.autoPolishStatus.textContent = `${job.processed || 0} / ${job.total || "?"} processed`;
        } else {
          elements.polishButton.querySelector("span:last-child").lastChild.textContent = "Polishing…";
        }
        pollJob(jobId, batch || job.kind === "batch");
      } else {
        state.batchRunning = false;
        showToast(job.message, job.status === "failed", 8000);
        await loadLibrary(state.active?.id);
        if (job.status === "failed") {
          await openPolishOptions(batch || job.kind === "batch" ? "pending" : "selected", job.message);
        }
      }
    } catch (error) {
      state.batchRunning = false;
      showToast(error.message, true);
      elements.polishButton.disabled = false;
      renderLibrary();
    }
  }, 2500);
}

elements.openFileButton.addEventListener("click", () => elements.fileInput.click());
elements.emptyOpenButton.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", () => chooseFile(elements.fileInput.files[0]));
elements.importForm.addEventListener("submit", importLecture);
elements.importDialog.addEventListener("close", () => {
  if (elements.importSubmit.disabled) return;
  state.pendingFile = null;
  elements.fileInput.value = "";
});
elements.librarySearch.addEventListener("input", renderLibrary);
elements.vaultStatusCard.addEventListener("click", checkVaultConnection);
elements.polishPendingButton.addEventListener("click", () => openPolishOptions("pending"));
elements.previousPage.addEventListener("click", () => goToPage(state.page - 1));
elements.nextPage.addEventListener("click", () => goToPage(state.page + 1));
elements.reloadFileButton.addEventListener("click", reloadFile);
elements.zoomOut.addEventListener("click", () => { state.zoom = Math.max(.5, state.zoom - .1); applyZoom(); });
elements.zoomIn.addEventListener("click", () => { state.zoom = Math.min(2, state.zoom + .1); applyZoom(); });
elements.polishButton.addEventListener("click", () => openPolishOptions("selected"));
elements.directPolishButton.addEventListener("click", runDirectPolish);
elements.copyManualPromptButton.addEventListener("click", () => copyPolishPrompt("manual", elements.copyManualPromptButton));
elements.copyNightlyPromptButton.addEventListener("click", () => copyPolishPrompt("nightly", elements.copyNightlyPromptButton));
elements.pageCanvas.addEventListener("click", () => elements.pageStage.focus({ preventScroll: true }));
elements.pageStrip.addEventListener("wheel", (event) => {
  if (event.ctrlKey) return;
  const primaryDelta = event.deltaY || event.deltaX;
  if (!primaryDelta) return;
  const unit = event.deltaMode === 1
    ? 28
    : event.deltaMode === 2
      ? elements.pageList.clientHeight
      : 1;
  event.preventDefault();
  event.stopPropagation();
  elements.pageList.scrollTop += primaryDelta * unit;
}, { passive: false });
document.querySelectorAll(".format-bar button").forEach((button) => button.addEventListener("click", () => formatSelection(button)));
window.addEventListener("keydown", (event) => {
  if (!state.active || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  if (elements.importDialog.open || elements.polishDialog.open) return;
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  const target = event.target;
  const isEditing = target instanceof HTMLElement && Boolean(target.closest("textarea, input, [contenteditable='true'], .cm-editor"));
  if (isEditing) return;
  event.preventDefault();
  event.stopPropagation();
  goToPage(state.page + (event.key === "ArrowRight" ? 1 : -1));
}, { capture: true });
window.addEventListener("resize", applyZoom);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveNow(); });

for (const eventName of ["dragenter", "dragover"]) {
  document.addEventListener(eventName, (event) => { event.preventDefault(); elements.emptyState.classList.add("dragging"); });
}
for (const eventName of ["dragleave", "drop"]) {
  document.addEventListener(eventName, (event) => { event.preventDefault(); elements.emptyState.classList.remove("dragging"); });
}
document.addEventListener("drop", (event) => chooseFile(event.dataTransfer?.files?.[0]));

if (!window.MarginEditor) throw new Error("The notes editor could not be loaded.");
state.editor = window.MarginEditor.create({
  parent: elements.noteEditor,
  onChange: queueSave,
  onSave: saveNow,
  onBlur: saveNow,
});

loadLibrary().catch((error) => showToast(error.message, true, 9000));
