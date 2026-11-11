// The bar at the top of every signed-in guest page: who is signed in, the
// two account pages, and Sign out (which ends the session on every device).
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../design/components";
import { useSignOut } from "./useGuestSession";

interface AccountBarProps {
  /** Null while the account is still loading. */
  email: string | null;
  /** The page we are on, so its own link is not offered. */
  current: "events" | "account" | "seat";
}

export function AccountBar({ email, current }: AccountBarProps) {
  const signOut = useSignOut();
  const [busy, setBusy] = useState(false);
  const hintId = useId();

  return (
    <nav className="acc-bar" aria-label="Your account">
      <p className="acc-bar-who">{email ? <>Signed in as <strong>{email}</strong></> : "Signed in"}</p>
      <div className="acc-bar-links">
        {current !== "events" && <Link to="/my">My events</Link>}
        {current !== "account" && <Link to="/my/account">My account</Link>}
        <Button
          variant="ghost"
          busy={busy}
          aria-describedby={hintId}
          onClick={() => {
            setBusy(true);
            void signOut();
          }}
        >
          Sign out
        </Button>
      </div>
      <p id={hintId} className="ev-muted">
        This signs you out on every device.
      </p>
    </nav>
  );
}
