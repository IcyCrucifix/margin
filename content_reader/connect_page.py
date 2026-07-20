from __future__ import annotations

import html
import json


def render_connection_page(origin: str, challenge: str) -> bytes:
    """Render the local, user-confirmed half of the public pairing handshake."""

    safe_origin = html.escape(origin)
    origin_json = json.dumps(origin)
    challenge_json = json.dumps(challenge)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect Margin</title>
  <style>
    :root {{ color-scheme: light; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    body {{ display:grid; min-height:100vh; margin:0; place-items:center; background:#f3f0e8; color:#17233a; }}
    main {{ width:min(460px, calc(100% - 40px)); padding:36px; border:1px solid #d8d1c5; border-radius:20px; background:#fffefa; box-shadow:0 24px 70px #18223429; }}
    h1 {{ margin:0 0 14px; font:500 2.3rem/1.05 Georgia, serif; }}
    p {{ color:#536078; line-height:1.65; }}
    code {{ overflow-wrap:anywhere; color:#17233a; }}
    .actions {{ display:flex; gap:12px; margin-top:26px; }}
    button {{ min-height:46px; padding:0 18px; border:1px solid #c9c2b4; border-radius:10px; background:#fff; color:#17233a; font-weight:750; cursor:pointer; }}
    #allow {{ border-color:#cb4d30; background:#ef6d4c; }}
    #status {{ min-height:1.5em; margin:18px 0 0; color:#8a3422; }}
  </style>
</head>
<body>
  <main>
    <h1>Connect this browser to Margin?</h1>
    <p><code>{safe_origin}</code> is asking to use the Margin service running on this computer.</p>
    <p>Your lectures and notes will continue to be read and written locally. Approving creates a temporary session for this browser tab.</p>
    <div class="actions">
      <button id="allow" type="button">Allow connection</button>
      <button id="cancel" type="button">Cancel</button>
    </div>
    <p id="status" role="status" aria-live="polite"></p>
  </main>
  <script>
    const requestingOrigin = {origin_json};
    const challenge = {challenge_json};
    const status = document.querySelector("#status");
    document.querySelector("#cancel").addEventListener("click", () => window.close());
    document.querySelector("#allow").addEventListener("click", async () => {{
      try {{
        const response = await fetch("/api/connect/approve", {{
          method: "POST",
          headers: {{ "Content-Type": "application/json", "X-Content-Reader": "1" }},
          body: JSON.stringify({{ origin: requestingOrigin, challenge }}),
        }});
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Connection failed.");
        if (!window.opener) throw new Error("Return to the public Margin tab and try again.");
        window.opener.postMessage(
          {{ type: "margin:connected", challenge, token: payload.token }},
          requestingOrigin,
        );
        status.textContent = "Connected. You may close this window.";
        window.setTimeout(() => window.close(), 350);
      }} catch (error) {{
        status.textContent = error.message;
      }}
    }});
  </script>
</body>
</html>""".encode("utf-8")
