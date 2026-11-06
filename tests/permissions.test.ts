import { describe, expect, it } from "vitest";
import {
  accessLevelsFor,
  canAccessFile,
  canChangeRole,
  canSetFileAccess,
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
    expect(canDeleteFile("MEMBER", "u1", "u1", "PUBLIC", "TEAM")).toBe(true);
    expect(canDeleteFile("MEMBER", "u1", "u2", "PUBLIC", "TEAM")).toBe(false);
    expect(canDeleteFile("ADMIN", "u1", "u2", "PUBLIC", "TEAM")).toBe(true);
    expect(canDeleteFile(null, "u1", "u1", "PUBLIC", "TEAM")).toBe(false);
  });
  it("can't be deleted by an uploader who can no longer open it", () => {
    expect(canDeleteFile("MEMBER", "u1", "u1", "PUBLIC", "ADMINS")).toBe(false);
    expect(canDeleteFile("ADMIN", "u1", "u2", "PUBLIC", "ADMINS")).toBe(true);
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

describe("file access levels", () => {
  const roles = [null, "MEMBER", "ADMIN", "OWNER"] as const;
  // expected[visibility][access] = which of [outsider, member, admin, owner] may open
  const expected: Record<string, Record<string, boolean[]>> = {
    PUBLIC: {
      TEAM: [true, true, true, true],
      MEMBERS: [false, true, true, true],
      ADMINS: [false, false, true, true],
    },
    PRIVATE: {
      TEAM: [false, true, true, true],
      MEMBERS: [false, true, true, true],
      ADMINS: [false, false, true, true],
    },
  };
  for (const [visibility, byAccess] of Object.entries(expected)) {
    for (const [access, allowed] of Object.entries(byAccess)) {
      it(`${visibility} team, ${access} file`, () => {
        roles.forEach((role, i) => expect(canAccessFile(visibility, role, access), String(role)).toBe(allowed[i]));
      });
    }
  }
  it("treats unknown levels as the strictest", () => {
    expect(canAccessFile("PUBLIC", "MEMBER", "SECRET")).toBe(false);
    expect(canAccessFile("PUBLIC", "ADMIN", "SECRET")).toBe(true);
  });

  it("members can't pick a level that locks themselves out", () => {
    expect(accessLevelsFor(null)).toEqual([]);
    expect(accessLevelsFor("MEMBER")).toEqual(["TEAM", "MEMBERS"]);
    expect(accessLevelsFor("ADMIN")).toEqual(["TEAM", "MEMBERS", "ADMINS"]);
    expect(accessLevelsFor("OWNER")).toEqual(["TEAM", "MEMBERS", "ADMINS"]);
  });

  it("uploader, owner and admins can change a file's level", () => {
    expect(canSetFileAccess("MEMBER", "u1", "u1", "PUBLIC", "TEAM", "MEMBERS")).toBe(true);
    expect(canSetFileAccess("MEMBER", "u1", "u2", "PUBLIC", "TEAM", "MEMBERS")).toBe(false);
    expect(canSetFileAccess("ADMIN", "u1", "u2", "PUBLIC", "TEAM", "ADMINS")).toBe(true);
    expect(canSetFileAccess("OWNER", "u1", "u2", "PUBLIC", "ADMINS", "TEAM")).toBe(true);
    expect(canSetFileAccess(null, "u1", "u1", "PUBLIC", "TEAM", "MEMBERS")).toBe(false);
  });
  it("members can't choose owner-&-admins, or touch a file raised above them", () => {
    expect(canSetFileAccess("MEMBER", "u1", "u1", "PUBLIC", "TEAM", "ADMINS")).toBe(false);
    expect(canSetFileAccess("MEMBER", "u1", "u1", "PUBLIC", "ADMINS", "TEAM")).toBe(false);
  });
});
