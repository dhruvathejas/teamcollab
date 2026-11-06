"use client";

import { useEffect, useRef, useState } from "react";

/** Errors that mean the browser has an old version of the app and must reload. */
function isStaleVersion(error: Error | undefined): boolean {
  if (!error) return false;
  return (
    error.name === "ChunkLoadError" ||
    /Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      error.message,
    )
  );
}

const WAIT_SECONDS = 8;

/**
 * Shown instead of a blank or unresponsive page when something fails to load,
 * typically while TeamCollab is being updated or restarted. Retries by itself:
 * a stale page reloads, anything else re-renders, and after a few tries the
 * whole page reloads.
 */
export function UpdatingScreen({ error, retry }: { error?: Error; retry: () => void }) {
  const [left, setLeft] = useState(WAIT_SECONDS);
  const attempts = useRef(0);

  useEffect(() => {
    if (error) console.error(error);
  }, [error]);

  useEffect(() => {
    if (left > 0) {
      const t = setTimeout(() => setLeft(left - 1), 1000);
      return () => clearTimeout(t);
    }
    attempts.current += 1;
    if (isStaleVersion(error) || attempts.current > 3) window.location.reload();
    else {
      retry();
      setLeft(WAIT_SECONDS * (attempts.current + 1));
    }
  }, [left, error, retry]);

  return (
    <div
      role="alert"
      style={{
        maxWidth: 420,
        margin: "48px auto",
        padding: "36px 28px",
        textAlign: "center",
        background: "var(--surface, #fff)",
        color: "var(--fg, #18181b)",
        border: "1px solid var(--line, #e2e2e8)",
        borderRadius: 16,
      }}
    >
      <div
        aria-hidden
        style={{
          display: "inline-flex",
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          background: "var(--accent, #4f46e5)",
          color: "var(--accent-fg, #fff)",
          fontWeight: 700,
          marginBottom: 18,
        }}
      >
        tc
      </div>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: "0 0 10px" }}>TeamCollab is under updates</h1>
      <p style={{ color: "var(--muted, #62626d)", lineHeight: 1.55, margin: "0 0 18px" }}>
        Something didn&apos;t load, usually because TeamCollab is being updated. Trying again in {left}s…
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid var(--line, #e2e2e8)",
          background: "var(--surface, #fff)",
          color: "var(--fg, #18181b)",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        Try now
      </button>
    </div>
  );
}
