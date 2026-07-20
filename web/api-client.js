(() => {
  const isPublicWorkspace = Boolean(document.querySelector('meta[name="margin-public-workspace"]'));
  const apiBase = isPublicWorkspace ? "http://127.0.0.1:4317" : "";
  const imageBlobUrls = new WeakMap();
  const imageAssignmentRevisions = new WeakMap();
  let sessionToken = null;

  function requestUrl(path) {
    return `${apiBase}${path}`;
  }

  function requestOptions(options = {}) {
    const headers = new Headers(options.headers || {});
    if (isPublicWorkspace && sessionToken) headers.set("X-Margin-Session", sessionToken);
    const next = { ...options, headers };
    if (isPublicWorkspace) next.targetAddressSpace = "local";
    return next;
  }

  async function fetchResponse(path, options = {}) {
    const response = await fetch(requestUrl(path), requestOptions(options));
    if (response.status === 401 && isPublicWorkspace && sessionToken) {
      sessionToken = null;
      window.dispatchEvent(new CustomEvent("margin:connectionlost"));
    }
    return response;
  }

  async function request(path, options = {}) {
    const response = await fetchResponse(path, options);
    let payload;
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) {
      const message = payload.error_key
        ? window.MarginI18n.t(payload.error_key, payload.error_params || {})
        : payload.error;
      throw new Error(message || `Request failed (${response.status})`);
    }
    return payload;
  }

  async function assignImage(image, path) {
    const revision = (imageAssignmentRevisions.get(image) || 0) + 1;
    imageAssignmentRevisions.set(image, revision);
    const previous = imageBlobUrls.get(image);
    if (previous) {
      URL.revokeObjectURL(previous);
      imageBlobUrls.delete(image);
    }
    if (!isPublicWorkspace) {
      image.src = path;
      return;
    }
    const response = await fetchResponse(path);
    if (!response.ok) throw new Error(`Image request failed (${response.status})`);
    const blobUrl = URL.createObjectURL(await response.blob());
    if (imageAssignmentRevisions.get(image) !== revision) {
      URL.revokeObjectURL(blobUrl);
      return;
    }
    imageBlobUrls.set(image, blobUrl);
    image.src = blobUrl;
  }

  async function preloadImage(path) {
    if (!isPublicWorkspace) {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = path;
      return;
    }
    const response = await fetchResponse(path);
    if (!response.ok) throw new Error(`Image request failed (${response.status})`);
    await response.blob();
  }

  function mutationOptions(options = {}) {
    if (isPublicWorkspace) return options;
    return {
      ...options,
      headers: { "X-Content-Reader": "1", ...(options.headers || {}) },
    };
  }

  window.MarginApi = Object.freeze({
    apiBase,
    isPublicWorkspace,
    request,
    assignImage,
    preloadImage,
    mutationOptions,
    hasSession() { return !isPublicWorkspace || Boolean(sessionToken); },
    setSessionToken(token) { sessionToken = token; },
    clearSessionToken() { sessionToken = null; },
  });
})();
