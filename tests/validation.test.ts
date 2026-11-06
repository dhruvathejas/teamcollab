import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "@/lib/files";
import { isLicenseId } from "@/lib/licenses";
import { slugify } from "@/lib/slug";
import { createTeamSchema, emailSchema, signupSchema, usernameSchema } from "@/lib/validation";

describe("usernameSchema", () => {
  it("normalises case and whitespace", () => {
    expect(usernameSchema.parse("  Ada-Lovelace ")).toBe("ada-lovelace");
  });
  it("rejects bad shapes and reserved names", () => {
    for (const bad of ["ab", "-ada", "ada-", "ada lovelace", "ada_l", "admin"]) {
      expect(usernameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("signupSchema", () => {
  const valid = { username: "ada", email: "Ada@Example.com ", password: "longenough", confirmPassword: "longenough" };
  it("accepts a valid sign-up and normalises the email", () => {
    const r = signupSchema.safeParse(valid);
    expect(r.success && r.data.email).toBe("ada@example.com");
  });
  it("requires matching passwords", () => {
    expect(signupSchema.safeParse({ ...valid, confirmPassword: "different" }).success).toBe(false);
  });
  it("requires an email", () => {
    expect(signupSchema.safeParse({ ...valid, email: "" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, email: undefined }).success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("rejects malformed addresses", () => {
    for (const bad of ["ada", "ada@", "@example.com", "a b@example.com"]) {
      expect(emailSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("createTeamSchema", () => {
  const valid = {
    name: "Open Robotics",
    slug: "open-robotics",
    description: "",
    license: "MIT",
    visibility: "PUBLIC",
    withReadme: true,
  };
  it("accepts a valid team", () => {
    expect(createTeamSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects unknown licenses and visibilities", () => {
    expect(createTeamSchema.safeParse({ ...valid, license: "WTFPL-ish" }).success).toBe(false);
    expect(createTeamSchema.safeParse({ ...valid, visibility: "SECRET" }).success).toBe(false);
  });
  it("rejects the reserved slug", () => {
    expect(createTeamSchema.safeParse({ ...valid, slug: "new" }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("slugify", () => {
    expect(slugify("Open Robotics!")).toBe("open-robotics");
    expect(slugify("  Café   Crew ")).toBe("cafe-crew");
  });
  it("sanitizeFileName strips paths and control characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\notes.txt")).toBe("notes.txt");
    expect(sanitizeFileName(".env")).toBe("env");
    expect(sanitizeFileName("a\u0000b.txt")).toBe("ab.txt");
    expect(sanitizeFileName("...")).toBeNull();
  });
  it("license ids", () => {
    expect(isLicenseId("Apache-2.0")).toBe(true);
    expect(isLicenseId("nope")).toBe(false);
  });
});

import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/t/open-robotics")).toBe("/t/open-robotics");
    expect(safeNext("/explore?q=robot#top")).toBe("/explore?q=robot#top");
  });
  it("rejects anything that could leave the site", () => {
    for (const bad of [
      "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/ /evil.com",
      "https://evil.com", "evil.com", "javascript:alert(1)", "", null, undefined, 42,
    ]) {
      expect(safeNext(bad), String(bad)).toBe("/");
    }
  });
});

describe("safeNext dot segments", () => {
  it("rejects paths that normalise to another host", () => {
    for (const bad of ["/.//evil.com", "/x/..//evil.com", "/%2e//evil.com", "/%2E%2E//evil.com", "/a/%2e%2e//evil.com"]) {
      expect(safeNext(bad), bad).toBe("/");
    }
  });
  it("still normalises harmless dot segments", () => {
    expect(safeNext("/t/./acme")).toBe("/t/acme");
  });
});

describe("NUL characters", () => {
  it("are stripped from free text before it reaches Postgres", () => {
    const r = createTeamSchema.safeParse({
      name: "Open\u0000 Robotics",
      slug: "open-robotics",
      description: "a\u0000b",
      license: "MIT",
      visibility: "PUBLIC",
      withReadme: false,
    });
    expect(r.success && [r.data.name, r.data.description]).toEqual(["Open Robotics", "ab"]);
  });
});
