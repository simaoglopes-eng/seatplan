// The frame around every page: skip link, header with the wordmark, the main
// landmark and a footer. Pages only supply their content.
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

const RESTAURANT_ROOTS = ["/restaurants", "/r", "/b", "/owner", "/staff"];

/** The routes of the Restaurants product (diner, owner, staff). Events and their sign-ins are not in it. */
export function isRestaurantRoute(pathname: string): boolean {
  return pathname === "/" || RESTAURANT_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

interface PageShellProps {
  /** Sets the browser tab title, so tabs and history are readable. */
  title: string;
  children: ReactNode;
  /** "wide" for map-heavy screens such as the editor. */
  width?: "normal" | "wide";
  /** Extra items on the right of the header, e.g. a "Sign out" button. */
  headerActions?: ReactNode;
}

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="SeatPlan, home">
      <svg viewBox="0 0 32 32" className="wordmark-mark" aria-hidden="true">
        <circle cx="16" cy="16" r="6.5" className="wordmark-table" />
        <circle cx="16" cy="4.5" r="2.8" className="wordmark-seat" />
        <circle cx="27.5" cy="16" r="2.8" className="wordmark-seat" />
        <circle cx="16" cy="27.5" r="2.8" className="wordmark-seat" />
        <circle cx="4.5" cy="16" r="2.8" className="wordmark-seat wordmark-seat-mine" />
      </svg>
      <span className="wordmark-text">SeatPlan</span>
    </Link>
  );
}

export function PageShell({ title, children, width = "normal", headerActions }: PageShellProps) {
  useEffect(() => {
    document.title = `${title} · SeatPlan`;
  }, [title]);

  // The Restaurants look (restaurant-theme.css) applies to <html> on its own routes only.
  const { pathname } = useLocation();
  const restaurants = isRestaurantRoute(pathname);
  useEffect(() => {
    const root = document.documentElement;
    if (restaurants) root.dataset.surface = "restaurants";
    else delete root.dataset.surface;
    return () => {
      delete root.dataset.surface;
    };
  }, [restaurants]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="shell-header">
        <div className={`shell-inner shell-${width}`}>
          <Wordmark />
          {headerActions && <div className="shell-actions">{headerActions}</div>}
        </div>
      </header>
      {/* tabIndex -1 lets the skip link move keyboard focus here, not just scroll. */}
      <main id="main" tabIndex={-1} className={`shell-main shell-inner shell-${width}`}>
        {children}
      </main>
      <footer className="shell-footer">
        <div className={`shell-inner shell-${width}`}>
          <p>SeatPlan, a student project at Nova SBE. Demo data only: every person here is invented.</p>
        </div>
      </footer>
    </div>
  );
}
