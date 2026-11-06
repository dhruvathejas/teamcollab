"use client"; // Error boundaries must be Client Components

import { UpdatingScreen } from "@/components/updating-screen";

// The root layout itself failed (e.g. its scripts are from an older version):
// render a standalone document with its own styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          padding: "16px",
          background: "var(--bg)",
          fontFamily: 'ui-sans-serif, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
        }}
      >
        <style>{`
          :root { --bg:#f7f7f8; --surface:#fff; --line:#e2e2e8; --fg:#18181b; --muted:#62626d; --accent:#4f46e5; --accent-fg:#fff; }
          @media (prefers-color-scheme: dark) {
            :root { --bg:#0e0e11; --surface:#17171b; --line:#2d2d35; --fg:#ececf1; --muted:#9b9ba7; --accent:#8b85ff; --accent-fg:#0e0e11; }
          }
        `}</style>
        <title>TeamCollab is under updates</title>
        <UpdatingScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
