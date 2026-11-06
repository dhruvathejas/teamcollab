import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  codeMatches,
  generateCode,
  generateToken,
  hashCode,
  hashToken,
  maskEmail,
  normalizeCode,
} from "@/lib/otp";

describe("generateCode", () => {
  it("returns six digits, zero-padded", () => {
    for (let i = 0; i < 500; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    expect(CODE_LENGTH).toBe(6);
  });
});

describe("tokens", () => {
  it("are long, random and hashed deterministically", () => {
    const a = generateToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(generateToken()).not.toBe(a);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toContain(a);
  });
});

describe("code hashing", () => {
  const secret = "s3cret";
  it("matches only the right code for the right challenge and secret", () => {
    const h = hashCode("123456", "chal-1", secret);
    expect(codeMatches("123456", "chal-1", secret, h)).toBe(true);
    expect(codeMatches("123457", "chal-1", secret, h)).toBe(false);
    expect(codeMatches("123456", "chal-2", secret, h)).toBe(false);
    expect(codeMatches("123456", "chal-1", "other", h)).toBe(false);
  });
  it("tolerates malformed stored hashes", () => {
    expect(codeMatches("123456", "c", secret, "")).toBe(false);
    expect(codeMatches("123456", "c", secret, "zz")).toBe(false);
  });
});

describe("normalizeCode", () => {
  it("accepts spacing and dashes", () => {
    expect(normalizeCode("123456")).toBe("123456");
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(normalizeCode("123-456")).toBe("123456");
  });
  it("rejects anything else", () => {
    for (const bad of ["12345", "1234567", "12a456", "", null, 123456]) {
      expect(normalizeCode(bad)).toBeNull();
    }
  });
});

describe("maskEmail", () => {
  it("hides most of the local part", () => {
    expect(maskEmail("satyaram@gmail.com")).toBe("sa••••••@gmail.com");
    expect(maskEmail("ab@x.io")).toBe("a•••@x.io");
    expect(maskEmail("a@x.io")).toBe("a•••@x.io");
    expect(maskEmail("not-an-email")).toBe("•••");
  });
});

import { mailboxKey } from "@/lib/mailbox";

describe("mailboxKey", () => {
  it("treats tags, case and Gmail dots as one mailbox", () => {
    const k = mailboxKey("ada@gmail.com");
    for (const v of ["Ada@gmail.com", "ada+1@gmail.com", "a.d.a@gmail.com", "ada+x@googlemail.com"]) {
      expect(mailboxKey(v), v).toBe(k);
    }
  });
  it("keeps distinct mailboxes distinct", () => {
    expect(mailboxKey("ada@example.com")).not.toBe(mailboxKey("ada@gmail.com"));
    // Dots only collapse for Gmail.
    expect(mailboxKey("a.da@example.com")).not.toBe(mailboxKey("ada@example.com"));
  });
});
