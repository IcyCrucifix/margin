(() => {
  const STORAGE_KEY = "margin.interfaceLanguage";
  const FALLBACK = "en";
  const supported = ["en", "zh-Hans"];
  const catalogs = {};
  let current = FALLBACK;
  let ready = Promise.resolve();

  function resolveLocale(value) {
    return supported.includes(value) ? value : FALLBACK;
  }

  function format(template, values = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`
    );
  }

  async function loadCatalog(locale) {
    if (catalogs[locale]) return catalogs[locale];
    if (window.MarginLocaleCatalogs?.[locale]) {
      catalogs[locale] = window.MarginLocaleCatalogs[locale];
      return catalogs[locale];
    }
    try {
      const localeUrl = new URL(`./locales/${encodeURIComponent(locale)}.json`, window.location.href);
      const response = await fetch(localeUrl, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Locale request failed (${response.status})`);
      catalogs[locale] = await response.json();
    } catch {
      catalogs[locale] = locale === FALLBACK ? {} : await loadCatalog(FALLBACK);
    }
    return catalogs[locale];
  }

  function t(key, values = {}) {
    const template = catalogs[current]?.[key] ?? catalogs[FALLBACK]?.[key] ?? key;
    return format(template, values);
  }

  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((node) => {
      node.title = t(node.dataset.i18nTitle);
    });
    root.querySelectorAll("[data-i18n-alt]").forEach((node) => {
      node.alt = t(node.dataset.i18nAlt);
    });
    document.documentElement.lang = current;
    document.title = "Margin";
  }

  async function setLocale(locale, persist = true) {
    const next = resolveLocale(locale);
    ready = ready.then(async () => {
      await Promise.all([loadCatalog(FALLBACK), loadCatalog(next)]);
      current = next;
      if (persist) localStorage.setItem(STORAGE_KEY, next);
      apply();
      window.dispatchEvent(new CustomEvent("margin:languagechange", { detail: { locale: next } }));
    });
    return ready;
  }

  window.MarginI18n = {
    ready: () => ready,
    t,
    apply,
    setLocale,
    currentLocale: () => current,
    supported: () => [...supported],
    storedLocale: () => resolveLocale(localStorage.getItem(STORAGE_KEY)),
  };

  ready = setLocale(window.MarginI18n.storedLocale(), false);
})();
