import { NextResponse, type NextRequest } from "next/server";
import { BYPASS_COOKIE, canBypass, isMaintenanceMode, maintenancePageHtml } from "@/lib/maintenance";

// Maintenance mode: with MAINTENANCE_MODE=true every page and API request gets
// the "TeamCollab is under updates" page (HTTP 503), read at request time, so
// it can be switched on and off without rebuilding.
export function proxy(request: NextRequest) {
  if (!isMaintenanceMode()) return NextResponse.next();

  const offered = request.nextUrl.searchParams.get("bypass") ?? undefined;
  if (canBypass(offered)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("bypass");
    const res = NextResponse.redirect(url);
    res.cookies.set(BYPASS_COOKIE, offered!, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 12 * 3600 });
    return res;
  }
  if (canBypass(request.cookies.get(BYPASS_COOKIE)?.value)) return NextResponse.next();

  const headers = { "Retry-After": "120", "Cache-Control": "no-store" };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "TeamCollab is under updates. Please try again in a few minutes." }, { status: 503, headers });
  }
  return new NextResponse(maintenancePageHtml(), {
    status: 503,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

export const config = {
  // Everything except Next's own static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
