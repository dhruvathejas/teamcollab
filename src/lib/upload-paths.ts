// Pathnames for files uploaded straight from the browser to Vercel Blob.
// Shared by the client (to build a path) and the server (to check that a path
// belongs to this team and this user before issuing a token or recording it).

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ID = "[A-Za-z0-9_-]{1,64}";
const NAMESPACE = "[a-z0-9-]{1,32}";

// Every blob pathname starts with an environment namespace (production,
// preview, development…). Preview deployments run on a copy of the production
// database, so without it they would delete production files.

/** Make a file name safe as one path segment ("Q3 plan (v2).pdf" -> "Q3_plan__v2_.pdf"). */
export function pathSegment(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_").slice(0, 100);
  return cleaned || "file";
}

export function uploadPathPrefix(ns: string, teamId: string, userId: string): string {
  return `${ns}/teams/${teamId}/uploads/${userId}/`;
}

/** <ns>/teams/<teamId>/uploads/<userId>/<uuid>/<name> */
export function buildUploadPath(ns: string, teamId: string, userId: string, fileName: string, uuid: string): string {
  return `${uploadPathPrefix(ns, teamId, userId)}${uuid}/${pathSegment(fileName)}`;
}

/** True only for a path built by buildUploadPath for exactly this namespace, team and user. */
export function isOwnUploadPath(pathname: string, ns: string, teamId: string, userId: string): boolean {
  if (![[ns, NAMESPACE], [teamId, ID], [userId, ID]].every(([v, re]) => new RegExp(`^${re}$`).test(v))) return false;
  return new RegExp(`^${ns}/teams/${teamId}/uploads/${userId}/${UUID}/[A-Za-z0-9._-]{1,100}$`).test(pathname);
}

/** True if a stored pathname belongs to this environment's namespace. */
export function inNamespace(pathname: string, ns: string): boolean {
  return pathname.startsWith(`${ns}/`);
}
