// Warns before unsaved floor-plan changes are thrown away.
//
// Two ways to leave a page need two guards:
//   1. Reload, closing the tab, or typing a new address: the browser asks,
//      when the page cancels the "beforeunload" event.
//   2. A link inside the app (react-router): the browser does not reload, so
//      we catch the click ourselves and ask with window.confirm.
// react-router's own useBlocker needs a "data router", and main.tsx uses the
// simpler <BrowserRouter>, so we listen for clicks instead.
// Not covered: the browser's Back button, which changes the address without a click.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const QUESTION = "You have unsaved changes to this floor plan. Leave without saving?";

/**
 * True when clicking this link would leave the current page in this tab (not
 * a "#main" jump, not a new tab). `here` is the router's path, which is the
 * address bar's path in the app (and the in-memory path in tests).
 */
function leavesPage(link: HTMLAnchorElement, event: MouseEvent, here: string): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target && link.target !== "_self") return false;
  const url = new URL(link.getAttribute("href") ?? "", window.location.href);
  return url.origin !== window.location.origin || url.pathname !== here;
}

export function useUnsavedGuard(dirty: boolean): void {
  const here = useLocation().pathname;
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault(); // modern browsers then show their own "Leave site?" prompt
    };
    const onClick = (event: MouseEvent): void => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || !leavesPage(link, event, here)) return;
      if (window.confirm(QUESTION)) return;
      // Stop both the browser and react-router's <Link> from navigating.
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase: runs before react-router's click handler sees the event.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, here]);
}
