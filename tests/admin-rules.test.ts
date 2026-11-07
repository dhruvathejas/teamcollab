import { describe, expect, it } from "vitest";
import {
  canMakeAdmin,
  canManageAdmin,
  canModerate,
  grantError,
  grantableProtections,
  optionsOf,
  type AdminOptions,
  type Person,
} from "@/lib/admin-rules";

const all: AdminOptions = { canAddAdmins: true, suspendable: true, bannable: true, deletable: true };
const root: Person = { id: "root", admin: { kind: "root" } };
const granted = (id: string, addedById: string | null, o: Partial<AdminOptions> = {}): Person => ({
  id,
  admin: { kind: "granted", addedById, ...all, ...o },
});
const user = (id: string): Person => ({ id, admin: null });

describe("making admins", () => {
  it("root and admins who can add admins can promote ordinary users", () => {
    expect(canMakeAdmin(root, user("u"))).toBe(true);
    expect(canMakeAdmin(granted("a", "root"), user("u"))).toBe(true);
    expect(canMakeAdmin(granted("a", "root", { canAddAdmins: false }), user("u"))).toBe(false);
    expect(canMakeAdmin(user("x"), user("u"))).toBe(false);
  });
  it("can't promote yourself or someone who is already an admin", () => {
    expect(canMakeAdmin(root, root)).toBe(false);
    expect(canMakeAdmin(root, granted("a", "root"))).toBe(false);
  });
});

describe("no escalation", () => {
  it("root can grant every protection", () => {
    expect(grantError(root, { canAddAdmins: true, suspendable: false, bannable: false, deletable: false })).toBeNull();
    expect(grantableProtections(root)).toEqual({ suspend: true, ban: true, delete: true });
  });
  it("an admin can't grant a protection they don't have", () => {
    const a = granted("a", "root", { bannable: false }); // protected from bans only
    expect(grantError(a, { ...all, bannable: false })).toBeNull();
    expect(grantError(a, { ...all, suspendable: false })).toMatch(/suspension/);
    expect(grantError(a, { ...all, deletable: false })).toMatch(/deletion/);
    expect(grantableProtections(a)).toEqual({ suspend: false, ban: true, delete: false });
  });
  it("admins who can't add admins can't grant anything", () => {
    expect(grantError(granted("a", "root", { canAddAdmins: false }), all)).toMatch(/can't add/);
    expect(grantError(user("u"), all)).toMatch(/can't add/);
  });
});

describe("editing keeps protections the editor couldn't grant", () => {
  const a = granted("a", "root"); // can add admins, has no protections
  const protectedByRoot = { canAddAdmins: false, suspendable: true, bannable: false, deletable: true };
  it("may keep an existing protection unchanged", () => {
    expect(grantError(a, protectedByRoot, protectedByRoot)).toBeNull();
    expect(grantError(a, { ...protectedByRoot, canAddAdmins: true }, protectedByRoot)).toBeNull();
  });
  it("may remove it, but not add a new one", () => {
    expect(grantError(a, { ...protectedByRoot, bannable: true }, protectedByRoot)).toBeNull();
    expect(grantError(a, { ...protectedByRoot, suspendable: false }, protectedByRoot)).toMatch(/suspension/);
  });
});

describe("managing admins", () => {
  const a = granted("a", "root");
  const b = granted("b", "a");
  it("whoever added them, or root, can manage an admin", () => {
    expect(canManageAdmin(root, a)).toBe(true);
    expect(canManageAdmin(root, b)).toBe(true);
    expect(canManageAdmin(a, b)).toBe(true);
  });
  it("other admins can't, and nobody manages themselves or root", () => {
    expect(canManageAdmin(b, a)).toBe(false);
    expect(canManageAdmin(granted("c", "root"), b)).toBe(false);
    expect(canManageAdmin(a, a)).toBe(false);
    expect(canManageAdmin(a, root)).toBe(false);
    expect(canManageAdmin(root, root)).toBe(false);
  });
  it("an appointer who lost 'can add admins' can't manage anymore (root still can)", () => {
    expect(canManageAdmin(granted("a", "root", { canAddAdmins: false }), b)).toBe(false);
  });
  it("orphaned admins (appointer deleted) are managed by root only", () => {
    const orphan = granted("o", null);
    expect(canManageAdmin(root, orphan)).toBe(true);
    expect(canManageAdmin(a, orphan)).toBe(false);
  });
});

describe("moderation", () => {
  it("any admin can moderate ordinary accounts, but not themselves", () => {
    const a = granted("a", "root", { canAddAdmins: false });
    for (const act of ["suspend", "ban", "delete", "signout", "removeFromTeam"] as const) {
      expect(canModerate(a, user("u"), act), act).toBe(true);
      expect(canModerate(user("x"), user("u"), act), act).toBe(false);
    }
    expect(canModerate(a, a, "ban")).toBe(false);
  });
  it("admins can be moderated only as their options allow", () => {
    const t = granted("t", "root", { suspendable: false, bannable: true, deletable: false });
    expect(canModerate(root, t, "ban")).toBe(true);
    expect(canModerate(root, t, "suspend")).toBe(false);
    expect(canModerate(root, t, "signout")).toBe(false);
    expect(canModerate(root, t, "removeFromTeam")).toBe(false);
    expect(canModerate(root, t, "delete")).toBe(false);
    expect(canModerate(granted("x", "root"), t, "ban")).toBe(true);
  });
  it("root admins can never be moderated", () => {
    for (const act of ["suspend", "ban", "delete", "signout", "removeFromTeam"] as const) {
      expect(canModerate(root, { id: "root2", admin: { kind: "root" } }, act)).toBe(false);
      expect(canModerate(granted("a", "root"), root, act)).toBe(false);
    }
  });
});

describe("optionsOf", () => {
  it("root has every power and protection", () => {
    expect(optionsOf({ kind: "root" })).toEqual({ canAddAdmins: true, suspendable: false, bannable: false, deletable: false });
    expect(optionsOf(null)).toBeNull();
  });
});

import { adminProtectionBlocks, canLiftRestriction, resolveOptions } from "@/lib/admin-rules";

describe("lifting bans and suspensions", () => {
  it("any admin can lift them for anyone else, even protected or root accounts", () => {
    const limited = granted("l", "root", { canAddAdmins: false });
    expect(canLiftRestriction(limited, granted("p", "root", { bannable: false, suspendable: false }))).toBe(true);
    expect(canLiftRestriction(limited, root)).toBe(true);
    expect(canLiftRestriction(limited, limited)).toBe(false);
    expect(canLiftRestriction(user("u"), user("v"))).toBe(false);
  });
});

describe("team actions on admins", () => {
  const g = granted("g", "root"); // ordinary granted admin
  const shielded = granted("p", "root", { suspendable: false });
  it("a site admin acting through admin powers can't remove protected admins or root", () => {
    expect(adminProtectionBlocks(g, false, root)).toBe(true);
    expect(adminProtectionBlocks(g, false, shielded)).toBe(true);
    expect(adminProtectionBlocks(g, false, granted("q", "root"))).toBe(false); // suspendable admin
    expect(adminProtectionBlocks(g, false, user("u"))).toBe(false);
    expect(adminProtectionBlocks(g, false, g)).toBe(true); // own row: use Leave team
  });
  it("the team's real owner, and non-admins, follow normal team rules", () => {
    expect(adminProtectionBlocks(g, true, root)).toBe(false);
    expect(adminProtectionBlocks(user("owner"), true, root)).toBe(false);
    expect(adminProtectionBlocks(user("teamadmin"), false, root)).toBe(false);
  });
});

describe("resolveOptions", () => {
  const a = granted("a", "root"); // can add admins, no protections of their own
  it("keeps stored protections the actor can't change, whatever the form says", () => {
    const current = { canAddAdmins: false, suspendable: true, bannable: false, deletable: true };
    expect(resolveOptions(a, { canAddAdmins: true, suspendable: true, bannable: true, deletable: true }, current))
      .toEqual({ canAddAdmins: true, suspendable: true, bannable: false, deletable: true });
    expect(resolveOptions(a, { canAddAdmins: false, suspendable: false, bannable: false, deletable: false }, null))
      .toEqual({ canAddAdmins: false, suspendable: true, bannable: true, deletable: true });
  });
  it("lets actors who have a protection grant or remove it", () => {
    expect(resolveOptions(root, { canAddAdmins: false, suspendable: false, bannable: true, deletable: false }, null))
      .toEqual({ canAddAdmins: false, suspendable: false, bannable: true, deletable: false });
  });
});
