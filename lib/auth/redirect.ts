// ─────────────────────────────────────────────────────────────
// Catalyst OS — Post-Login Redirect Logic
//
// Pure functions — no server-only imports, safe to test directly.
//
// Access matrix (which next= prefixes each role may use):
//   admin  → /admin, /hq, /account, /overwatch
//   coach  → /hq, /account
//   client → /portal, /account
//
// Role fallbacks when next is absent or unauthorized:
//   admin  → /admin
//   coach  → /hq
//   client → /portal
//
// Security invariants:
//   - Protocol-relative paths (//evil.com) are rejected
//   - Absolute URLs (https://evil.com) are rejected
//   - Paths must begin with exactly one forward slash
//   - User must be authorized for the destination prefix
// ─────────────────────────────────────────────────────────────

export type UserRole = "admin" | "coach" | "client";

// Role fallback destinations.
const ROLE_FALLBACK: Record<UserRole, string> = {
  admin: "/admin",
  coach: "/hq",
  client: "/portal",
};

// Route prefixes each role may reach via the next param.
const ROLE_ALLOWED_PREFIXES: Record<UserRole, string[]> = {
  admin: ["/admin", "/hq", "/account", "/overwatch"],
  coach: ["/hq", "/account"],
  client: ["/portal", "/account"],
};

// Returns true only for safe internal relative paths.
// Rejects: absolute URLs, protocol-relative URLs, non-slash starts.
export function isSafeRelativePath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;   // protocol-relative
  if (path.includes("://")) return false;    // absolute URL
  return true;
}

// Returns the redirect destination for the given role and raw next param.
// The next param may be raw (not decoded) — this function decodes it.
export function resolvePostLoginRedirect(
  next: string | null,
  role: string,
): string {
  const fallback = ROLE_FALLBACK[role as UserRole] ?? "/portal";
  const allowedPrefixes = ROLE_ALLOWED_PREFIXES[role as UserRole] ?? ["/portal"];

  if (!next) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }

  if (!isSafeRelativePath(decoded)) return fallback;

  const authorized = allowedPrefixes.some(
    (p) => decoded === p || decoded.startsWith(p + "/"),
  );

  return authorized ? decoded : fallback;
}
