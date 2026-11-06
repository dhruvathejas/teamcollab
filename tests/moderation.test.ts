import { describe, expect, it } from "vitest";
import { accountStatus, blockedMessage, isSiteAdmin, sessionIsValid, siteAdminEmails } from "@/lib/moderation";

const verified = new Date("2026-01-01");

describe("site admins", () => {
  const admins = siteAdminEmails("Boss@Example.com, second@example.com");
  it("matches configured emails case-insensitively", () => {
    expect(isSiteAdmin({ email: "boss@example.com", emailVerified: verified }, admins)).toBe(true);
    expect(isSiteAdmin({ email: "SECOND@example.com", emailVerified: verified }, admins)).toBe(true);
  });
  it("requires a verified email and an exact address", () => {
    expect(isSiteAdmin({ email: "boss@example.com", emailVerified: null }, admins)).toBe(false);
    expect(isSiteAdmin({ email: "boss+x@example.com", emailVerified: verified }, admins)).toBe(false);
    expect(isSiteAdmin(null, admins)).toBe(false);
  });
  it("defaults to the owner's address", () => {
    expect(siteAdminEmails(undefined)).toEqual(new Set(["dhruvathejasb@gmail.com"]));
    expect(siteAdminEmails("")).toEqual(new Set());
  });
});

describe("accountStatus", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const base = { bannedAt: null, suspendedUntil: null, moderationReason: null };
  it("is active by default and after a suspension ends", () => {
    expect(accountStatus(base, now).state).toBe("active");
    expect(accountStatus({ ...base, suspendedUntil: new Date("2026-05-31") }, now).state).toBe("active");
  });
  it("reports bans before suspensions", () => {
    const s = accountStatus({ bannedAt: now, suspendedUntil: new Date("2027-01-01"), moderationReason: "spam" }, now);
    expect(s).toEqual({ state: "banned", reason: "spam" });
    expect(blockedMessage(s)).toBe("This account has been banned. Reason: spam");
  });
  it("reports an active suspension with its end", () => {
    const s = accountStatus({ ...base, suspendedUntil: new Date("2026-06-08T12:00:00Z") }, now);
    expect(s.state).toBe("suspended");
    expect(blockedMessage(s)).toMatch(/^This account is suspended until Jun 8, 2026, 12:00 PM UTC\.$/);
  });
});

describe("sessionIsValid", () => {
  const cut = new Date("2026-06-01T00:00:00Z");
  it("keeps sessions when nobody forced a sign-out", () => {
    expect(sessionIsValid(undefined, null)).toBe(true);
  });
  it("ends sessions that began before the forced sign-out", () => {
    expect(sessionIsValid(cut.getTime() - 1, cut)).toBe(false);
    expect(sessionIsValid(undefined, cut)).toBe(false);
    expect(sessionIsValid(cut.getTime() + 1000, cut)).toBe(true);
  });
});
