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
  thumbnailObserver: null,
  renderRevision: 0,
  editor: null,
  polishPrompts: null,
  polishPromptScope: "selected",
  languageOptions: [],
  languageApiAvailable: true,
  pendingLanguageChange: null,
};

const $ = (selector) => document.querySelector(selector);
const t = (key, values = {}) => window.MarginI18n.t(key, values);
const FALLBACK_LANGUAGE_OPTIONS = Object.freeze([
  { code: "en", english_name: "English", native_name: "English" },
  { code: "zh-Hans", english_name: "Simplified Chinese", native_name: "简体中文" },
]);
const elements = {
  openFileButton: $("#openFileButton"), emptyOpenButton: $("#emptyOpenButton"), fileInput: $("#fileInput"),
  polishPendingButton: $("#polishPendingButton"), autoPolishStatus: $("#autoPolishStatus"),
  librarySearch: $("#librarySearch"), lectureList: $("#lectureList"), lectureCount: $("#lectureCount"),
  vaultStatusCard: $("#vaultStatusCard"), vaultStatusText: $("#vaultStatusText"), vaultLabel: $("#vaultLabel"),
  vaultProof: $("#vaultProof"), courseLabel: $("#courseLabel"), documentTitle: $("#documentTitle"),
  pageCounter: $("#pageCounter"), currentPageLabel: $("#currentPageLabel"), totalPagesLabel: $("#totalPagesLabel"),
  previousPage: $("#previousPage"), nextPage: $("#nextPage"), polishButton: $("#polishButton"), shortcutHelpButton: $("#shortcutHelpButton"),
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
  copyNightlyPromptButton: $("#copyNightlyPromptButton"), shortcutsDialog: $("#shortcutsDialog"),
  languageButton: $("#languageButton"), languageDialog: $("#languageDialog"), languageForm: $("#languageForm"),
  interfaceLanguage: $("#interfaceLanguage"), languageContextNote: $("#languageContextNote"),
  interfaceOnlyScope: $("#interfaceOnlyScope"), interfaceAndNotesScope: $("#interfaceAndNotesScope"), polishedNoteLanguageScope: $("#polishedNoteLanguageScope"),
  languageConfirmDialog: $("#languageConfirmDialog"), languageConfirmForm: $("#languageConfirmForm"), languageConfirmBody: $("#languageConfirmBody"),
  languageFutureButton: $("#languageFutureButton"), languageRepolishButton: $("#languageRepolishButton"),
};

async function api(path, options = {}) {
  const response = await fetch(path, options);
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const message = payload.error_key ? t(payload.error_key, payload.error_params || {}) : payload.error;
    throw new Error(message || `Request failed (${response.status})`);
  }
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

function localizeServerMessage(message) {
  const known = {
    "Already up to date — Stage 2 found no source or memo changes.": "polish.already_current",
    "Already up to date — the source and raw memos have not changed.": "polish.already_current",
    "No pending lectures — every polished note is current.": "library.nothing_pending",
    "Stage 2 finished without installing a current polished note.": "toast.stage_two_failed",
  };
  return known[message] ? t(known[message]) : message;
}

function isEditingTarget(target) {
  return target instanceof HTMLElement
    && Boolean(target.closest("textarea, input, [contenteditable='true'], .cm-editor"));
}

function openShortcutHelp() {
  if (!elements.shortcutsDialog.open) elements.shortcutsDialog.showModal();
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
  elements.vaultStatusText.textContent = t("storage.checking");
  elements.vaultProof.textContent = t("storage.testing_access");
  try {
    const health = await api("/api/health");
    state.health = health;
    const isObsidian = health.storage_mode === "obsidian";
    elements.vaultLabel.textContent = `${health.root_name || health.vault_name || t("storage.configured_folder")} · ${health.storage_label || t("storage.notes_folder")}`;
    elements.vaultStatusCard.title = `${health.root_path || health.vault_path}\n${health.reason || ""}\n${t("storage.verify_again")}`;
    if (!state.batchRunning) {
      elements.autoPolishStatus.textContent = health.automation?.enabled
        ? t("storage.automatic_daily", { time: health.automation.daily_at })
        : t("polish.manual_batch");
    }
    elements.vaultStatusCard.classList.remove("checking");
    if (health.connected) {
      elements.vaultStatusCard.classList.add("connected");
      elements.vaultStatusText.textContent = isObsidian ? t("storage.obsidian_verified") : t("storage.notes_folder_verified");
      elements.vaultProof.textContent = `${isObsidian ? t("storage.vault_detected") : t("storage.folder_ready")} · ${t("storage.read_write_passed")}`;
    } else {
      elements.vaultStatusCard.classList.add("disconnected");
      elements.vaultStatusText.textContent = isObsidian ? t("storage.obsidian_unavailable") : t("storage.notes_folder_unavailable");
      elements.vaultProof.textContent = health.reason || t("storage.verification_failed");
    }
    return health;
  } catch (error) {
    elements.vaultStatusCard.classList.remove("checking");
    elements.vaultStatusCard.classList.add("disconnected");
    elements.vaultStatusText.textContent = t("storage.local_service_unavailable");
    elements.vaultProof.textContent = t("storage.click_check_again");
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
    elements.autoPolishStatus.textContent = pendingCount === 1
      ? t("library.lecture_ready", { count: pendingCount })
      : pendingCount > 1
        ? t("library.lectures_ready", { count: pendingCount })
        : t("library.nothing_pending");
  }
  elements.lectureList.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "library-empty";
    empty.textContent = state.documents.length ? t("library.no_matching") : t("library.empty");
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
  return new Intl.DateTimeFormat(window.MarginI18n.currentLocale(), { month: "short", day: "numeric" }).format(date);
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
  elements.polishButton.querySelector("span:last-child").lastChild.textContent = doc.polished_current ? t("reader.up_to_date") : t("reader.polish_now");
  renderLibrary();
  renderPageList();
  renderPage();
}

function renderPageList() {
  state.thumbnailObserver?.disconnect();
  state.thumbnailObserver = createThumbnailObserver();
  elements.pageList.replaceChildren();
  if (!state.active) return;
  for (let page = 1; page <= state.active.page_count; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-tile${page === state.page ? " active" : ""}`;
    button.dataset.page = String(page);
    button.setAttribute("aria-label", t("reader.page_label", { page }));
    button.innerHTML = `<span class="page-thumb-frame"><img class="page-thumb" alt="" loading="lazy" decoding="async" fetchpriority="low"></span><span class="page-tile-footer">${page}</span><span class="page-note-dot${state.notes[String(page)]?.trim() ? " visible" : ""}"></span>`;
    const thumbnail = button.querySelector(".page-thumb");
    thumbnail.addEventListener("load", () => button.classList.add("thumbnail-ready"), { once: true });
    thumbnail.addEventListener("error", () => { thumbnail.hidden = true; }, { once: true });
    loadThumbnailWhenVisible(thumbnail, page);
    button.addEventListener("click", () => goToPage(page));
    elements.pageList.append(button);
  }
  updatePageListState();
}

function createThumbnailObserver() {
  if (!("IntersectionObserver" in window)) return null;
  return new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.src = entry.target.dataset.src;
      entry.target.removeAttribute("data-src");
      observer.unobserve(entry.target);
    });
  }, { root: elements.pageList, rootMargin: "320px 0px" });
}

function loadThumbnailWhenVisible(thumbnail, page) {
  const source = thumbnailImageUrl(page);
  if (!state.thumbnailObserver) {
    thumbnail.src = source;
    return;
  }
  thumbnail.dataset.src = source;
  state.thumbnailObserver.observe(thumbnail);
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
  elements.pageKindLabel.textContent = state.active.kind === "pptx"
    ? t("reader.slide", { page })
    : t("reader.page", { page });
  elements.memoTitle.textContent = state.active.kind === "pptx"
    ? t("reader.notes_for_slide", { page })
    : t("reader.notes_for_page", { page });
  elements.previousPage.disabled = page === 1;
  elements.nextPage.disabled = page === state.active.page_count;
  state.editor.setValue(state.notes[String(page)] || "");
  state.savedValue = state.editor.getValue();
  setSaveState("saved", t("reader.saved"));
  clearTimeout(state.loadingTimer);
  elements.pageLoading.textContent = t("reader.rendering_page");
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
    elements.pageLoading.textContent = t("reader.render_failed");
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
    showToast(t("toast.reload_save_failed"), true, 6500);
    return;
  }
  elements.reloadFileButton.disabled = true;
  state.renderRevision = Date.now();
  state.preloadedPages.clear();
  renderPageList();
  renderPage();
  elements.reloadFileButton.disabled = false;
  showToast(t("toast.file_reloaded"));
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

function localizeEditorPlaceholder() {
  const placeholder = elements.noteEditor.querySelector(".cm-placeholder");
  if (placeholder) placeholder.textContent = t("reader.editor_placeholder");
}

function queueSave(value = state.editor?.getValue() || "") {
  if (!state.active) return;
  state.notes[String(state.page)] = value;
  setSaveState("saving", t("reader.unsaved"));
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
  setSaveState("saving", t("reader.saving"));
  try {
    const result = await api(`/api/doc/${documentId}/note`, mutateOptions({
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, content }),
    }));
    if (state.active?.id === documentId && state.page === page && state.editor.getValue() === content) {
      state.savedValue = content;
      setSaveState("saved", t("reader.saved"));
    }
    const doc = state.documents.find((item) => item.id === documentId);
    if (doc) {
      doc.has_notes = Object.values(state.notes).some((value) => value.trim());
      doc.polished_current = false;
      elements.polishButton.disabled = state.batchRunning || !doc.has_notes;
      elements.polishButton.classList.remove("is-current");
      elements.polishButton.querySelector("span:last-child").lastChild.textContent = t("reader.polish_now");
      elements.polishPendingButton.disabled = state.batchRunning
        || !state.documents.some((item) => item.has_notes && !item.polished_current);
    }
    return result;
  } catch (error) {
    setSaveState("error", t("reader.save_failed"));
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
  if (!["pdf", "pptx"].includes(extension)) return showToast(t("toast.file_type"), true);
  state.pendingFile = file;
  elements.importFileKind.textContent = extension.toUpperCase();
  elements.importFileName.textContent = file.name;
  elements.importFileSize.textContent = `${(file.size / 1024 / 1024).toFixed(file.size > 10_000_000 ? 1 : 2)} MB`;
  elements.importTitle.value = file.name.replace(/\.(pdf|pptx)$/i, "").replace(/[_-]+/g, " ");
  elements.importDate.value = new Date().toLocaleDateString("en-CA");
  elements.importDialog.showModal();
}

const DEFAULT_NOTE_LANGUAGE_KEY = "margin.defaultPolishedNoteLanguage";

async function loadLanguageOptions() {
  try {
    const result = await api("/api/languages");
    if (!Array.isArray(result.languages) || !result.languages.length) {
      throw new Error("Language list is empty.");
    }
    state.languageOptions = result.languages;
    state.languageApiAvailable = true;
  } catch {
    // Static assets can update before a long-running local Python service is restarted.
    // Keep interface switching usable instead of preventing the whole app from loading.
    state.languageOptions = FALLBACK_LANGUAGE_OPTIONS;
    state.languageApiAvailable = false;
  }
}

function defaultNoteLanguage() {
  const stored = localStorage.getItem(DEFAULT_NOTE_LANGUAGE_KEY);
  return state.languageOptions.some((item) => item.code === stored) ? stored : "en";
}

function populateLanguageOptions() {
  const current = window.MarginI18n.currentLocale();
  elements.interfaceLanguage.replaceChildren();
  state.languageOptions.forEach((language) => {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = language.native_name;
    elements.interfaceLanguage.append(option);
  });
  elements.interfaceLanguage.value = current;
}

function updateLanguageContext() {
  const noteLanguageUnavailable = !state.languageApiAvailable;
  elements.interfaceAndNotesScope.disabled = noteLanguageUnavailable;
  elements.polishedNoteLanguageScope.classList.toggle("is-disabled", noteLanguageUnavailable);
  if (noteLanguageUnavailable) {
    elements.interfaceOnlyScope.checked = true;
    elements.languageContextNote.textContent = t("language.service_restart_required");
    return;
  }
  elements.languageContextNote.textContent = state.active
    ? t("language.active_note")
    : t("language.no_active_note");
}

async function openLanguageDialog() {
  await loadLanguageOptions();
  populateLanguageOptions();
  updateLanguageContext();
  elements.languageDialog.showModal();
}

function selectedLanguageScope() {
  return document.querySelector("input[name='languageScope']:checked")?.value || "interface";
}

async function savePolishedNoteLanguage(language, apply) {
  const documentId = state.active?.id;
  if (!documentId) {
    localStorage.setItem(DEFAULT_NOTE_LANGUAGE_KEY, language);
    return;
  }
  const result = await api(`/api/doc/${documentId}/polished-note-language`, mutateOptions({
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, apply }),
  }));
  const updated = result.document;
  state.documents = state.documents.map((doc) => doc.id === updated.id ? { ...doc, ...updated } : doc);
  if (state.active?.id === updated.id) state.active = { ...state.active, ...updated };
  localStorage.setItem(DEFAULT_NOTE_LANGUAGE_KEY, language);
  renderLibrary();
  return updated;
}

function showLanguageConfirm(language) {
  const currentCode = state.active?.installed_polished_note_language || "en";
  const current = state.languageOptions.find((item) => item.code === currentCode);
  const next = state.languageOptions.find((item) => item.code === language);
  state.pendingLanguageChange = language;
  elements.languageConfirmBody.textContent = t("language.confirm_body", {
    language: current?.native_name || currentCode,
    next_language: next?.native_name || language,
  });
  elements.languageConfirmDialog.showModal();
}

async function applyLanguagePreference(language, scope) {
  await window.MarginI18n.setLocale(language);
  showToast(t("language.interface_updated"));
  if (scope !== "interface-and-notes") return;
  if (!state.languageApiAvailable) {
    showToast(t("language.service_restart_required"), true, 7000);
    return;
  }

  localStorage.setItem(DEFAULT_NOTE_LANGUAGE_KEY, language);
  if (!state.active) return;
  const current = state.active.installed_polished_note_language || "en";
  const hasPolishedNote = Boolean(state.active.polished_exists);
  if (hasPolishedNote && current !== language) {
    showLanguageConfirm(language);
    return;
  }
  await savePolishedNoteLanguage(language, "future");
  showToast(t("language.note_future", { language: state.languageOptions.find((item) => item.code === language)?.native_name || language }));
}

async function submitLanguageDialog(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    elements.languageDialog.close();
    return;
  }
  const language = elements.interfaceLanguage.value;
  const scope = selectedLanguageScope();
  elements.languageDialog.close();
  try {
    await applyLanguagePreference(language, scope);
  } catch (error) {
    showToast(error.message, true, 7000);
  }
}

async function chooseLanguageUpdate(apply) {
  const language = state.pendingLanguageChange;
  state.pendingLanguageChange = null;
  elements.languageConfirmDialog.close();
  if (!language) return;
  try {
    await savePolishedNoteLanguage(language, apply);
    const label = state.languageOptions.find((item) => item.code === language)?.native_name || language;
    if (apply === "repolish") {
      showToast(t("language.note_pending", { language: label }));
      await openPolishOptions("selected");
    } else {
      showToast(t("language.note_future", { language: label }));
    }
  } catch (error) {
    showToast(error.message, true, 7000);
  }
}

function closeLanguageConfirmation() {
  state.pendingLanguageChange = null;
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
    filename: state.pendingFile.name,
    course: elements.importCourse.value,
    title: elements.importTitle.value,
    date: elements.importDate.value,
    polished_note_language: defaultNoteLanguage(),
  });
  elements.importSubmit.disabled = true;
  elements.importSubmit.textContent = t("import.reading_pages");
  try {
    const { document } = await api(`/api/import?${params}`, mutateOptions({ method: "POST", body: state.pendingFile }));
    elements.importDialog.close();
    showToast(t("import.ready", { title: document.title }));
    state.pendingFile = null;
    elements.fileInput.value = "";
    await loadLibrary(document.id);
  } catch (error) {
    showToast(error.message, true, 7000);
  } finally {
    elements.importSubmit.disabled = false;
    elements.importSubmit.textContent = t("import.submit");
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
  if (!prompt) return showToast(t("polish.prompt_not_ready"), true);
  const original = button.textContent;
  try {
    await copyText(prompt);
    button.textContent = t("polish.copied_short");
    showToast(t("polish.copied"));
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
      ? t("polish.options")
      : t("polish.pending_title");
    elements.directPolishButton.textContent = scope === "selected"
      ? t("polish.this_lecture")
      : t("polish.pending_in_margin");
    elements.directPolishButton.disabled = !available;
    elements.copyManualPromptButton.textContent = scope === "selected"
      ? t("polish.copy_once")
      : t("polish.copy_batch");
    elements.copyNightlyPromptButton.textContent = t("polish.copy_nightly");
    if (available) {
      elements.polishAvailabilityMessage.textContent = t("polish.ready", { label: result.runner.label });
      elements.polishRunnerReason.textContent = t("polish.ready_reason");
      elements.polishRunnerReason.classList.remove("error");
    } else {
      elements.polishAvailabilityMessage.textContent = t("polish.unavailable");
      elements.polishRunnerReason.textContent = directFailure || result.runner?.reason || t("polish.no_runner");
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
    elements.polishButton.querySelector("span:last-child").lastChild.textContent = t("polish.starting");
  try {
    const result = await api(`/api/doc/${state.active.id}/polish`, mutateOptions({ method: "POST" }));
    if (result.status === "skipped") {
      showToast(localizeServerMessage(result.message));
      await loadLibrary(state.active.id);
      return;
    }
    if (result.status === "unavailable") {
      await openPolishOptions("selected", result.reason || result.message);
      return;
    }
    showToast(t("polish.running"), false, 6500);
    pollJob(result.id, result.kind === "batch");
  } catch (error) {
    elements.polishButton.disabled = false;
    elements.polishButton.querySelector("span:last-child").lastChild.textContent = t("reader.polish_now");
    showToast(error.message, true, 7000);
  }
}

async function polishPendingDirect() {
  await saveNow();
  state.batchRunning = true;
  elements.polishPendingButton.disabled = true;
  elements.polishButton.disabled = true;
  elements.autoPolishStatus.textContent = t("polish.batch_starting");
  try {
    const result = await api("/api/polish/pending", mutateOptions({ method: "POST" }));
    if (result.status === "skipped") {
      state.batchRunning = false;
      showToast(localizeServerMessage(result.message));
      await loadLibrary(state.active?.id);
      return;
    }
    if (result.status === "unavailable") {
      state.batchRunning = false;
      await openPolishOptions("pending", result.reason || result.message);
      return;
    }
    showToast(t("polish.pending_running"), false, 6500);
    pollJob(result.id, true);
  } catch (error) {
    state.batchRunning = false;
    elements.autoPolishStatus.textContent = t("polish.manual_batch");
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
          elements.autoPolishStatus.textContent = t("polish.processed", { processed: job.processed || 0, total: job.total || "?" });
        } else {
          elements.polishButton.querySelector("span:last-child").lastChild.textContent = t("polish.polishing");
        }
        pollJob(jobId, batch || job.kind === "batch");
      } else {
        state.batchRunning = false;
        showToast(localizeServerMessage(job.message), job.status === "failed", 8000);
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
elements.languageButton.addEventListener("click", openLanguageDialog);
elements.languageForm.addEventListener("submit", submitLanguageDialog);
elements.languageConfirmForm.addEventListener("close", closeLanguageConfirmation);
elements.languageFutureButton.addEventListener("click", () => chooseLanguageUpdate("future"));
elements.languageRepolishButton.addEventListener("click", () => chooseLanguageUpdate("repolish"));
elements.polishPendingButton.addEventListener("click", () => openPolishOptions("pending"));
elements.previousPage.addEventListener("click", () => goToPage(state.page - 1));
elements.nextPage.addEventListener("click", () => goToPage(state.page + 1));
elements.shortcutHelpButton.addEventListener("click", openShortcutHelp);
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
  if (event.key !== "Escape" || !elements.shortcutsDialog.open) return;
  event.preventDefault();
  elements.shortcutsDialog.close();
}, { capture: true });
window.addEventListener("keydown", (event) => {
  if (event.key !== "?" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (isEditingTarget(event.target)) return;
  if (elements.importDialog.open || elements.polishDialog.open || elements.shortcutsDialog.open || elements.languageDialog.open || elements.languageConfirmDialog.open) return;
  event.preventDefault();
  openShortcutHelp();
}, { capture: true });
window.addEventListener("keydown", (event) => {
  if (!state.active || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  if (elements.importDialog.open || elements.polishDialog.open || elements.shortcutsDialog.open || elements.languageDialog.open || elements.languageConfirmDialog.open) return;
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  if (isEditingTarget(event.target)) return;
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
localizeEditorPlaceholder();

window.addEventListener("margin:languagechange", () => {
  localizeEditorPlaceholder();
  renderLibrary();
  if (state.active) renderPage();
  checkVaultConnection();
});

(async () => {
  await window.MarginI18n.ready();
  await loadLanguageOptions();
  await loadLibrary();
})().catch((error) => showToast(error.message, true, 9000));
