import { describe, expect, it } from "vitest";
import { canBypass, isMaintenanceMode, maintenancePageHtml } from "@/lib/maintenance";

describe("maintenance mode", () => {
  it("turns on for common truthy values only", () => {
    for (const v of ["1", "true", "TRUE", " on ", "yes"]) expect(isMaintenanceMode(v), v).toBe(true);
    for (const v of [undefined, "", "0", "false", "off"]) expect(isMaintenanceMode(v), String(v)).toBe(false);
  });
  it("lets only the exact, long-enough bypass token through", () => {
    const token = "a-long-secret-token-123";
    expect(canBypass(token, token)).toBe(true);
    expect(canBypass("a-long-secret-token-124", token)).toBe(false);
    expect(canBypass(undefined, token)).toBe(false);
    expect(canBypass("short", "short")).toBe(false);
    expect(canBypass("anything", undefined)).toBe(false);
  });
  it("renders the under-updates page", () => {
    const html = maintenancePageHtml();
    expect(html).toContain("TeamCollab is under updates");
    expect(html).toContain('http-equiv="refresh"');
  });
});
