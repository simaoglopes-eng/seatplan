// The right side of the header on every public page (spec 4.2): "For restaurant
// owners" and "Plan an event". On a phone the two links sit behind a Menu button.
import { useState } from "react";
import { Link } from "react-router-dom";
import { getSessionToken } from "../../api/client";
import "./discover.css";

export function PublicHeaderActions() {
  const [open, setOpen] = useState(false);
  const owners = getSessionToken() ? "/owner" : "/owner/sign-in";
  return (
    <nav className="site-nav" aria-label="Main">
      <button type="button" className="btn btn-ghost site-nav-toggle" aria-expanded={open} aria-controls="site-nav-links" onClick={() => setOpen((v) => !v)}>
        Menu
      </button>
      <div id="site-nav-links" className={`site-nav-links${open ? " is-open" : ""}`}>
        <Link to={owners} className="btn btn-ghost">
          For restaurant owners
        </Link>
        <Link to="/demo" className="btn btn-ghost">
          Plan an event
        </Link>
      </div>
    </nav>
  );
}
