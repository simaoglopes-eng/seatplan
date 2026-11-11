// Where to go after signing in. The "next" page comes from the address bar,
// so anyone can write it into a link. We only follow it when it is clearly a
// page of the guest area (/my/...); anything else could send people to
// another website (an "open redirect").

/** The default page after signing in. */
export const MY_HOME = "/my";

/**
 * Returns `next` when it is a safe /my/ page, otherwise null.
 * Refused: other sites ("//x", "https://x"), a double slash anywhere,
 * a colon anywhere, a backslash, and every page outside /my/.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/my/")) return null;
  if (next.includes("//") || next.includes(":") || next.includes("\\")) return null;
  return next;
}

/** The sign-in page that comes back to `here` afterwards. */
export function signInPath(here: string): string {
  const next = safeNext(here);
  return next ? `/my/sign-in?next=${encodeURIComponent(next)}` : "/my/sign-in";
}
