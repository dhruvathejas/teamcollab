import { describe, expect, it } from "vitest";
import { pickClientIp } from "@/lib/client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("pickClientIp", () => {
  it("uses the right-most X-Forwarded-For entry by default", () => {
    expect(pickClientIp(h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(pickClientIp(h({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(pickClientIp(h({}))).toBe("unknown");
  });
  it("uses the configured header when set (e.g. Railway's X-Real-IP)", () => {
    // Next.js fills X-Forwarded-For with the proxy's address when the proxy doesn't set it.
    const req = h({ "x-forwarded-for": "10.0.0.1", "x-real-ip": "5.5.5.5" });
    expect(pickClientIp(req, "X-Real-IP")).toBe("5.5.5.5");
    expect(pickClientIp(h({}), "x-real-ip")).toBe("unknown");
  });
  it("caps the length", () => {
    expect(pickClientIp(h({ "x-real-ip": "a".repeat(500) }), "x-real-ip")).toHaveLength(64);
  });
});
