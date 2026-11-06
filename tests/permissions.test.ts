import { describe, expect, it } from "vitest";
import {
  canChangeRole,
  canDeleteFile,
  canLeave,
  canManageTeam,
  canRemoveMember,
  canRequestToJoin,
  canViewTeam,
  canWriteFiles,
} from "@/lib/permissions";

describe("canViewTeam", () => {
  it("lets anyone see public teams", () => {
    expect(canViewTeam("PUBLIC", null)).toBe(true);
  });
  it("hides private teams from outsiders", () => {
    expect(canViewTeam("PRIVATE", null)).toBe(false);
  });
  it("shows private teams to members and invitees", () => {
    expect(canViewTeam("PRIVATE", "MEMBER")).toBe(true);
    expect(canViewTeam("PRIVATE", null, true)).toBe(true);
  });
});

describe("team management", () => {
  it("is limited to owners and admins", () => {
    expect(canManageTeam("OWNER")).toBe(true);
    expect(canManageTeam("ADMIN")).toBe(true);
    expect(canManageTeam("MEMBER")).toBe(false);
    expect(canManageTeam(null)).toBe(false);
  });
});

describe("join requests", () => {
  it("are only for non-members of public teams", () => {
    expect(canRequestToJoin("PUBLIC", null)).toBe(true);
    expect(canRequestToJoin("PUBLIC", "MEMBER")).toBe(false);
    expect(canRequestToJoin("PRIVATE", null)).toBe(false);
  });
});

describe("files", () => {
  it("can be written by any member", () => {
    expect(canWriteFiles("MEMBER")).toBe(true);
    expect(canWriteFiles(null)).toBe(false);
  });
  it("can be deleted by the uploader or by owners/admins", () => {
    expect(canDeleteFile("MEMBER", "u1", "u1")).toBe(true);
    expect(canDeleteFile("MEMBER", "u1", "u2")).toBe(false);
    expect(canDeleteFile("ADMIN", "u1", "u2")).toBe(true);
    expect(canDeleteFile(null, "u1", "u1")).toBe(false);
  });
});

describe("members", () => {
  it("owner can remove admins and members, never the owner", () => {
    expect(canRemoveMember("OWNER", "ADMIN")).toBe(true);
    expect(canRemoveMember("OWNER", "MEMBER")).toBe(true);
    expect(canRemoveMember("OWNER", "OWNER")).toBe(false);
  });
  it("admins can remove members but not other admins", () => {
    expect(canRemoveMember("ADMIN", "MEMBER")).toBe(true);
    expect(canRemoveMember("ADMIN", "ADMIN")).toBe(false);
    expect(canRemoveMember("MEMBER", "MEMBER")).toBe(false);
  });
  it("only the owner promotes and demotes admins", () => {
    expect(canChangeRole("OWNER", "MEMBER", "ADMIN")).toBe(true);
    expect(canChangeRole("OWNER", "ADMIN", "MEMBER")).toBe(true);
    expect(canChangeRole("ADMIN", "MEMBER", "ADMIN")).toBe(false);
    expect(canChangeRole("OWNER", "MEMBER", "OWNER")).toBe(false);
    expect(canChangeRole("OWNER", "OWNER", "MEMBER")).toBe(false);
  });
  it("everyone but the owner can leave", () => {
    expect(canLeave("MEMBER")).toBe(true);
    expect(canLeave("ADMIN")).toBe(true);
    expect(canLeave("OWNER")).toBe(false);
    expect(canLeave(null)).toBe(false);
  });
});
