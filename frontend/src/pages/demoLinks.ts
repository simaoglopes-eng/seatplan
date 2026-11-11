// Turns the backend's demo links ({"attendee_ana": "/e/<token>", ...}) into
// labelled entries grouped by vertical, ready for the home page cards.

export type DemoGroup = "events" | "restaurant" | "tools";

export interface DemoEntry {
  name: string;
  label: string;
  path: string;
  group: DemoGroup;
}

/** Which card a link belongs on, judged by the frontend route it opens. */
function groupFor(path: string): DemoGroup {
  if (path.startsWith("/e/") || path.startsWith("/organiser/")) return "events";
  // The shared event link and the guest account pages.
  if (path.startsWith("/j/") || path === "/my" || path.startsWith("/my/")) return "events";
  if (path.startsWith("/r/") || path.startsWith("/b/") || path.startsWith("/staff/")) return "restaurant";
  return "tools";
}

/**
 * Keeps links inside the app. A full URL is cut to its path, and the API's
 * attendee path "/a/<token>" is mapped to the page route "/e/<token>".
 */
export function toAppPath(link: string): string {
  const path = link.startsWith("http") ? new URL(link).pathname : link;
  return path.startsWith("/a/") ? `/e/${path.slice(3)}` : path;
}

/** "attendee_ana" becomes "Attendee Ana". */
export function labelFor(name: string): string {
  return name
    .split(/[_-]+/)
    .filter((word) => word !== "")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function demoEntries(links: Record<string, string>): DemoEntry[] {
  return Object.keys(links)
    .sort()
    .map((name) => {
      const path = toAppPath(links[name]);
      return { name, label: labelFor(name), path, group: groupFor(path) };
    });
}
