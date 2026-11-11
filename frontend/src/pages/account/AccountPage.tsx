// Route /my/account: the account's details, the privacy text, and deleting
// the account (GDPR, docs/guest-accounts.md section 11). Deleting asks for
// the password in a dialog, frees the seats on the server, and forgets the
// session in this browser.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { deleteMyAccount } from "../../api/guest";
import type { GuestAccountOut } from "../../api/guest";
import { Button, Dialog, ErrorState, Field, PageShell, Skeleton } from "../../design/components";
import { AccountBar } from "./AccountBar";
import { asApiError, splitFieldMessage } from "./FormProblem";
import { PrivacyText } from "./PrivacyText";
import { useMyAccount, useSessionExpired } from "./useGuestSession";
import "../events/events.css";
import "./account.css";

/** "10 November 2026". */
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function AccountPage() {
  const [deleted, setDeleted] = useState(false);
  // Two screens, so the "are you signed in?" check stops once the account is gone.
  return deleted ? <DeletedScreen /> : <AccountScreen onDeleted={() => setDeleted(true)} />;
}

function AccountScreen({ onDeleted }: { onDeleted: () => void }) {
  const { load, retry } = useMyAccount();
  return (
    <PageShell title="My account">
      <div className="acc-page acc-wide">
        <AccountBar email={load.status === "ready" ? load.me.account.email : null} current="account" />
        <h1 className="acc-title">My account</h1>
        {load.status === "loading" && <Skeleton lines={3} label="Loading your account" />}
        {load.status === "error" && <ErrorState message={load.error.message} onRetry={() => void retry()} />}
        {load.status === "ready" && <AccountDetails account={load.me.account} onDeleted={onDeleted} />}
      </div>
    </PageShell>
  );
}

function AccountDetails({ account, onDeleted }: { account: GuestAccountOut; onDeleted: () => void }) {
  return (
    <>
      <section className="ev-card-flat" aria-labelledby="acc-details">
        <h2 id="acc-details" className="ev-subtitle">
          Your details
        </h2>
        <dl className="acc-facts">
          <dt>Name</dt>
          <dd>{account.name}</dd>
          <dt>Email</dt>
          <dd>{account.email}</dd>
        </dl>
        <p className="ev-muted">Account made on {formatDay(account.created_at)}</p>
      </section>
      <section className="ev-card-flat" aria-labelledby="acc-privacy">
        <h2 id="acc-privacy" className="ev-subtitle">
          Your data
        </h2>
        <PrivacyText />
      </section>
      <DangerZone onDeleted={onDeleted} />
    </>
  );
}

/** The delete button and its dialog, which asks for the password first. */
function DangerZone({ onDeleted }: { onDeleted: () => void }) {
  const expired = useSessionExpired();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (): void => {
    setOpen(false);
    setPassword("");
    setError(null);
  };

  const onSubmit = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault();
    if (password === "") {
      setError("Enter your password to delete your account.");
      return;
    }
    setBusy(true);
    try {
      await deleteMyAccount(password);
      onDeleted();
    } catch (caught) {
      // A 401 means the session itself is over: go and sign in again.
      if (expired(caught)) return;
      // A wrong password is a 422 "password: That password is not correct.".
      const apiError = asApiError(caught);
      const { text } = apiError.code === "validation" ? splitFieldMessage(apiError.message, ["password"]) : { text: apiError.message };
      setError(text);
      setBusy(false);
    }
  };

  return (
    <section className="ev-card-flat acc-danger" aria-labelledby="acc-danger">
      <h2 id="acc-danger" className="ev-subtitle">
        Delete your account
      </h2>
      <p>This frees your seats and takes you off the events you joined with this account.</p>
      <div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </div>
      <Dialog
        open={open}
        title="Delete your account?"
        onClose={close}
        actions={
          <>
            <Button variant="secondary" onClick={close}>
              Keep my account
            </Button>
            <Button variant="danger" busy={busy} type="submit" form="acc-delete-form">
              Delete my account
            </Button>
          </>
        }
      >
        <p>
          We free your seats and wipe the emails we keep for you. Where you joined with the shared link, we take you off the guest list.
          Where the organiser invited you, they keep their own record of your invitation, without your account. This cannot be undone.
        </p>
        <form id="acc-delete-form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <Field
            label="Your password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            error={error}
            onChange={(e) => setPassword(e.target.value)}
          />
        </form>
      </Dialog>
    </section>
  );
}

/** After deleting: the session is gone, so the page only says so and offers the way home. */
function DeletedScreen() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <PageShell title="Account deleted">
      <div className="acc-page" role="status">
        <h1 ref={heading} tabIndex={-1} className="acc-title">
          Your account is deleted.
        </h1>
        <p>Your seats are free again and the emails we kept for you are wiped. Copies already in your inbox stay there.</p>
        <Link to="/">Back to the home page</Link>
      </div>
    </PageShell>
  );
}
