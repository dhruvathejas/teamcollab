/**
 * Only allow same-site relative paths as post-login destinations. Browsers
 * ignore tabs/newlines and treat "\\" like "/" in URLs, so "/\t/evil.com" or
 * "/\\evil.com" would leave the site; anything with whitespace, control
 * characters or backslashes is rejected, and the result must stay on our origin.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || /[\u0000-\u0020\u007f\\]/.test(next)) return "/";
  try {
    const base = "http://same-origin.invalid";
    const url = new URL(next, base);
    const out = `${url.pathname}${url.search}${url.hash}`;
    // Dot segments can normalise "/.//evil.com" into "//evil.com", which a browser
    // treats as another host, so the normalised result is checked as well.
    return url.origin === base && !out.startsWith("//") ? out : "/";
  } catch {
    return "/";
  }
}
