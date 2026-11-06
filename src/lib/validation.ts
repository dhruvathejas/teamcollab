import { z } from "zod";
import { isLicenseId } from "./licenses";

export { slugify } from "./slug";

const RESERVED_USERNAMES = new Set([
  "admin", "api", "login", "logout", "signup", "settings", "explore",
  "teams", "new", "verify", "invites", "root", "support", "help",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username must be at most 32 characters.")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Use lowercase letters, numbers and hyphens; no hyphen at the start or end.",
  )
  .refine((u) => !RESERVED_USERNAMES.has(u), "That username is reserved.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long.")
  .pipe(z.email("Enter a valid email address."));

export const signupSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    name: z.string().trim().max(80).optional().default(""),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "The team URL must be at least 2 characters.")
  .max(40, "The team URL must be at most 40 characters.")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Use lowercase letters, numbers and hyphens; no hyphen at the start or end.",
  )
  .refine((s) => s !== "new", "That team URL is reserved.");

export const visibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);

export const licenseSchema = z
  .string()
  .refine(isLicenseId, "Choose a license from the list.");

export const teamNameSchema = z
  .string()
  .trim()
  .min(2, "Team name must be at least 2 characters.")
  .max(60, "Team name must be at most 60 characters.");

export const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Description must be at most 500 characters.");

export const createTeamSchema = z.object({
  name: teamNameSchema,
  slug: slugSchema,
  description: descriptionSchema.optional().default(""),
  license: licenseSchema,
  visibility: visibilitySchema,
  withReadme: z.boolean(),
});

/** First validation message per field, for showing next to form inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
