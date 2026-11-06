import { createHash } from "node:crypto";

/**
 * One key per real mailbox, so "ada+1@gmail.com" and "a.da@gmail.com" share a
 * budget with "ada@gmail.com". Hashed to keep keys short and addresses out of
 * the table.
 */
export function mailboxKey(email: string): string {
  const at = email.lastIndexOf("@");
  let local = email.slice(0, at).toLowerCase();
  let domain = email.slice(at + 1).toLowerCase();
  local = local.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return createHash("sha256").update(`${local}@${domain}`).digest("hex").slice(0, 32);
}
