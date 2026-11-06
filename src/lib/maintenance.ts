// Maintenance mode ("TeamCollab is under updates"). Pure helpers used by
// src/proxy.ts; unit-tested.

export const BYPASS_COOKIE = "tc_maintenance_bypass";

export function isMaintenanceMode(value = process.env.MAINTENANCE_MODE): boolean {
  return ["1", "true", "on", "yes"].includes((value ?? "").trim().toLowerCase());
}

/**
 * During maintenance, someone holding MAINTENANCE_BYPASS_TOKEN (sent once as
 * ?bypass=<token>, then remembered in a cookie) can still use the site, e.g. to
 * check an update before reopening. No token configured = nobody bypasses.
 */
export function canBypass(provided: string | undefined, token = process.env.MAINTENANCE_BYPASS_TOKEN): boolean {
  if (!token || token.length < 16 || !provided || provided.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

/** Self-contained page (no app CSS/JS needed); reloads itself every 30 s. */
export function maintenancePageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30">
<meta name="robots" content="noindex">
<title>TeamCollab is under updates</title>
<style>
  :root { --bg:#f7f7f8; --surface:#fff; --line:#e2e2e8; --fg:#18181b; --muted:#62626d; --accent:#4f46e5; --accent-fg:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0e0e11; --surface:#17171b; --line:#2d2d35; --fg:#ececf1; --muted:#9b9ba7; --accent:#8b85ff; --accent-fg:#0e0e11; }
  }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 16px;
         background:var(--bg); color:var(--fg); font-family: ui-sans-serif, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  main { max-width:420px; width:100%; text-align:center; background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:36px 28px; }
  .logo { display:inline-flex; width:44px; height:44px; align-items:center; justify-content:center; border-radius:12px;
          background:var(--accent); color:var(--accent-fg); font-weight:700; margin-bottom:18px; }
  h1 { font-size:1.4rem; margin:0 0 10px; }
  p { color:var(--muted); line-height:1.55; margin:0 0 6px; }
  .spin { width:22px; height:22px; margin:18px auto 0; border:3px solid var(--line); border-top-color:var(--accent);
          border-radius:50%; animation:spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation:none; } }
</style>
</head>
<body>
<main>
  <div class="logo" aria-hidden="true">tc</div>
  <h1>TeamCollab is under updates</h1>
  <p>We're making some improvements and will be back in a few minutes.</p>
  <p>This page refreshes by itself. Your teams and files are safe.</p>
  <div class="spin" role="status" aria-label="Waiting for the update to finish"></div>
</main>
</body>
</html>`;
}
