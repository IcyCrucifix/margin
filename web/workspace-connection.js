(() => {
  const EXPECTED_PROTOCOL_VERSION = 1;
  const elements = {
    gate: document.querySelector("#connectionGate"),
    shell: document.querySelector("#appShell"),
    connect: document.querySelector("#connectLocalMargin"),
    disconnect: document.querySelector("#disconnectLocalMargin"),
    status: document.querySelector("#connectionStatus"),
  };
  let onConnected = null;

  function randomChallenge() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function showGate(message = "Start the local companion, then connect this workspace.", isError = false) {
    elements.shell.hidden = true;
    elements.gate.hidden = false;
    elements.status.textContent = message;
    elements.status.classList.toggle("error", isError);
    elements.connect.disabled = false;
  }

  function showWorkspace() {
    elements.gate.hidden = true;
    elements.shell.hidden = false;
    elements.disconnect.hidden = !window.MarginApi.isPublicWorkspace;
    elements.disconnect.disabled = false;
  }

  async function disconnect() {
    elements.disconnect.disabled = true;
    try {
      await window.MarginApi.request(
        "/api/connect/disconnect",
        window.MarginApi.mutationOptions({ method: "POST" }),
      );
    } catch {
      // A lost companion invalidates the in-memory session just as effectively.
    } finally {
      window.MarginApi.clearSessionToken();
      showGate("Disconnected. Connect again when you are ready.");
    }
  }

  function waitForPairing(popup, challenge) {
    return new Promise((resolve, reject) => {
      let watcher;
      const timeout = window.setTimeout(() => finish(new Error("Connection approval timed out.")), 120_000);
      function finish(error, token) {
        window.clearTimeout(timeout);
        window.clearInterval(watcher);
        window.removeEventListener("message", receive);
        if (error) reject(error);
        else resolve(token);
      }
      function receive(event) {
        const expectedOrigin = window.MarginApi.apiBase;
        if (event.origin !== expectedOrigin) return;
        const payload = event.data;
        if (payload?.type !== "margin:connected" || payload.challenge !== challenge) return;
        if (typeof payload.token !== "string" || payload.token.length < 32) {
          finish(new Error("Local Margin returned an invalid session."));
          return;
        }
        finish(null, payload.token);
      }
      window.addEventListener("message", receive);
      watcher = window.setInterval(() => {
        if (!popup.closed) return;
        window.clearInterval(watcher);
        window.setTimeout(() => finish(new Error("Connection approval was cancelled.")), 250);
      }, 400);
    });
  }

  async function connect() {
    elements.connect.disabled = true;
    elements.status.classList.remove("error");
    elements.status.textContent = "Opening your installed local Margin…";
    const challenge = randomChallenge();
    const query = new URLSearchParams({ origin: window.location.origin, challenge });
    const popup = window.open(
      `${window.MarginApi.apiBase}/connect?${query}`,
      "margin-local-connect",
      "width=540,height=650",
    );
    if (!popup) {
      showGate("Allow pop-ups for this connection request, then try again.", true);
      return;
    }
    let pairingApproved = false;
    try {
      const token = await waitForPairing(popup, challenge);
      pairingApproved = true;
      window.MarginApi.setSessionToken(token);
      const companion = await window.MarginApi.request("/api/connect/status");
      if (companion.protocol_version !== EXPECTED_PROTOCOL_VERSION) {
        throw new Error("Update the local Margin companion before connecting.");
      }
      await window.MarginApi.request("/api/health");
      showWorkspace();
      await onConnected();
    } catch (error) {
      popup.close();
      window.MarginApi.clearSessionToken();
      const unreachable = error instanceof TypeError || error.message === "Failed to fetch";
      const message = unreachable && pairingApproved
        ? "Connection was approved, but Chrome could not access local Margin. Allow Local Network Access for this site, then try again."
        : unreachable
          ? "Local Margin could not be reached. Start your installed local Margin, then try again."
          : error.message;
      showGate(message || "Local Margin could not be reached.", true);
    }
  }

  function initialize(callback) {
    onConnected = callback;
    if (!window.MarginApi.isPublicWorkspace) {
      showWorkspace();
      return callback();
    }
    showGate();
    return Promise.resolve();
  }

  elements.connect.addEventListener("click", connect);
  elements.disconnect.addEventListener("click", disconnect);
  window.addEventListener("margin:connectionlost", () => {
    showGate("The local session ended. Connect again to continue.", true);
  });

  window.MarginConnection = Object.freeze({ initialize });
})();
