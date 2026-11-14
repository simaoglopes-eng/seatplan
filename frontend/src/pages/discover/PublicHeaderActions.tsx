// The right side of the header on every public page (spec 4.2): "For restaurant
// owners" and "Plan an event". On a phone the two links sit behind a Menu button.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getSessionToken } from "../../api/client";
import "./discover.css";

export function PublicHeaderActions() {
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = (): void => { setOpen(false); button.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent): void => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const outside = (event: PointerEvent): void => { if (event.target instanceof Node && !nav.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  const owners = getSessionToken() ? "/owner" : "/owner/sign-in";
  return (
    <nav ref={nav} className="site-nav" aria-label="Main" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button ref={button} type="button" className="btn btn-ghost site-nav-toggle" aria-expanded={open} aria-controls="site-nav-links" onClick={() => setOpen((v) => !v)}>
        Menu
      </button>
      <div id="site-nav-links" className={`site-nav-links${open ? " is-open" : ""}`}>
        <Link to={owners} className="btn btn-ghost" onClick={close}>
          For restaurant owners
        </Link>
        <Link to="/demo" className="btn btn-ghost" onClick={close}>
          Plan an event
        </Link>
      </div>
    </nav>
  );
}
