import { describe, expect, it } from "vitest";
import { buildUploadPath, inNamespace, isOwnUploadPath, pathSegment } from "@/lib/upload-paths";

const team = "cmw4ko8100004iczhoau57in8";
const user = "cmw4kp0aa0001iczh9xq3c2lm";
const uuid = "3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f";
const ns = "production";

describe("pathSegment", () => {
  it("keeps safe characters and replaces the rest", () => {
    expect(pathSegment("Q3 plan (v2).pdf")).toBe("Q3_plan__v2_.pdf");
    expect(pathSegment("../../etc/passwd")).toBe("__.._etc_passwd"); // no slashes, no leading dot
    expect(pathSegment("")).toBe("file");
    expect(pathSegment("a".repeat(300))).toHaveLength(100);
  });
});

describe("isOwnUploadPath", () => {
  const own = buildUploadPath(ns, team, user, "notes.txt", uuid);
  it("accepts the path built for this team and user", () => {
    expect(own).toBe(`production/teams/${team}/uploads/${user}/${uuid}/notes.txt`);
    expect(isOwnUploadPath(own, ns, team, user)).toBe(true);
  });
  it("rejects other teams, other users and malformed paths", () => {
    expect(isOwnUploadPath(own, ns, "otherteam", user)).toBe(false);
    expect(isOwnUploadPath(own, ns, team, "otheruser")).toBe(false);
    expect(isOwnUploadPath(own, "preview", team, user)).toBe(false);
    for (const bad of [
      `teams/${team}/uploads/${user}/${uuid}/notes.txt`,
      `${ns}/teams/${team}/files/${uuid}/notes.txt`,
      `${ns}/teams/${team}/uploads/${user}/not-a-uuid/notes.txt`,
      `${ns}/teams/${team}/uploads/${user}/${uuid}/../x`,
      `${ns}/teams/${team}/uploads/${user}/${uuid}/a/b.txt`,
      `${ns}/teams/${team}/uploads/${user}/${uuid}/`,
      `/${ns}/teams/${team}/uploads/${user}/${uuid}/notes.txt`,
      `${own}?x=1`,
    ]) {
      expect(isOwnUploadPath(bad, ns, team, user), bad).toBe(false);
    }
  });
  it("rejects ids that could smuggle regex or path syntax", () => {
    expect(isOwnUploadPath(own, ns, ".*", user)).toBe(false);
    expect(isOwnUploadPath(own, ns, team, "a/b")).toBe(false);
    expect(isOwnUploadPath(own, ".*", team, user)).toBe(false);
  });
});

describe("inNamespace", () => {
  it("matches only the exact namespace prefix", () => {
    expect(inNamespace("production/teams/x/files/y", "production")).toBe(true);
    expect(inNamespace("preview/teams/x/files/y", "production")).toBe(false);
    expect(inNamespace("production-old/teams/x", "production")).toBe(false);
  });
});
