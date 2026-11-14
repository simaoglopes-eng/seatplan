// The owner's workspace: a short side menu (My restaurants, then the steps of one restaurant)
// beside the page. Every owner page sits in it, so the owner always knows where they are and
// can reach the next step without going back to the list.
import { Link } from "react-router-dom";
import { logout } from "../../api/client";
import { PageShell } from "../../design/components";
import "./owner.css";
import "./owner-v5.css";

export type OwnerSection = "restaurants" | "profile" | "photos" | "hours" | "rooms" | "review";

interface OwnerShellProps {
  /** The browser tab title. */
  title: string;
  /** The restaurant in the menu and in the top line; none on the list of restaurants. */
  venueId?: string;
  venueName?: string;
  current: OwnerSection;
  /** Where "Public restaurant" leads; the booking address forwards to the public page when there is one. */
  publicHref?: string;
  children: React.ReactNode;
  width?: "normal" | "wide";
}

const STEPS: { key: Exclude<OwnerSection, "restaurants">; label: string; path: string }[] = [
  { key: "profile", label: "Profile", path: "profile" },
  { key: "photos", label: "Photos", path: "photos" },
  { key: "hours", label: "Hours", path: "hours" },
  { key: "rooms", label: "Rooms", path: "rooms" },
  { key: "review", label: "Review and publish", path: "review" },
];

export function OwnerShell({ title, venueId, venueName, current, publicHref, children, width = "wide" }: OwnerShellProps) {
  const base = venueId ? `/owner/${encodeURIComponent(venueId)}` : null;
  return (
    <PageShell title={title} width={width}>
      <div className="ow-shell">
        <nav className="ow-nav" aria-label="Restaurant owner">
          <p className="rb5-eyebrow">Restaurant owner</p>
          <ul>
            <li>
              <Link to="/owner" aria-current={current === "restaurants" ? "page" : undefined}>
                My restaurants
              </Link>
            </li>
            {base &&
              STEPS.map((step) => (
                <li key={step.key}>
                  <Link to={`${base}/${step.path}`} aria-current={current === step.key ? "page" : undefined}>
                    {step.label}
                  </Link>
                </li>
              ))}
          </ul>
          <ul className="ow-nav-more">
            {venueId && (
              <li>
                <Link to={publicHref ?? `/r/${encodeURIComponent(venueId)}`}>Public restaurant</Link>
              </li>
            )}
            <li>
              <Link to="/owner/sign-in" onClick={() => logout()}>
                Sign out
              </Link>
            </li>
          </ul>
        </nav>
        <div className="ow-main">
          {venueName && <p className="ow-workspace">{venueName}</p>}
          {children}
        </div>
      </div>
    </PageShell>
  );
}
