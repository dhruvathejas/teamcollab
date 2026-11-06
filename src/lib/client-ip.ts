// Which request header holds the real client address depends on the host:
// - CLIENT_IP_HEADER set (e.g. "x-real-ip" on Railway): use that header.
// - Otherwise the right-most X-Forwarded-For entry, i.e. the one added by the
//   proxy closest to the app (Vercel, nginx with $proxy_add_x_forwarded_for).
// The result becomes part of a rate-limit key, so it is length-capped.

type HeaderSource = { get(name: string): string | null };

export function pickClientIp(h: HeaderSource, configuredHeader?: string): string {
  const name = configuredHeader?.trim().toLowerCase();
  if (name) {
    const value = h.get(name)?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
    return (value ?? "unknown").slice(0, 64);
  }
  const chain = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return (chain.at(-1) ?? h.get("x-real-ip") ?? "unknown").slice(0, 64);
}
