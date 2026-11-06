// Helpers for team files that are safe to use on client and server.

export const FILE_ACCESS_LABELS: Record<string, string> = {
  TEAM: "Everyone who can see the team",
  MEMBERS: "Team members",
  ADMINS: "Owner & admins",
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const README_NAME = "README.md";

/**
 * Normalise an uploaded file name: drop any directory part, control characters
 * and leading dots, and cap the length. Returns null if nothing usable remains.
 */
export function sanitizeFileName(raw: string): string | null {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : null;
}

export function isReadme(name: string): boolean {
  return name.toLowerCase() === README_NAME.toLowerCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
