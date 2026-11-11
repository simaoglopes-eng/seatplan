// Route /my/forgot: ask for a password reset code. The answer is the same
// whether or not an account exists, so this page never says which it is.
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { forgotPassword } from "../../api/guest";
import { Button, Field, PageShell } from "../../design/components";
import { ProblemBox, asApiError, looksLikeEmail } from "./FormProblem";
import "./account.css";

/** What ResetPage reads from the router state after a code was sent. */
export interface ResetState {
  sentTo: string;
  demoCode?: string;
}

export default function ForgotPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAttempt((n) => n + 1);
    setProblem(null);
    if (!looksLikeEmail(email)) {
      setError("Enter an email address like name@example.com.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const sent = await forgotPassword(email.trim());
      const state: ResetState = { sentTo: sent.sent_to, demoCode: sent.demo_code };
      navigate(`/my/reset?email=${encodeURIComponent(email.trim())}`, { state });
    } catch (caught) {
      setProblem(asApiError(caught).message);
      setBusy(false);
    }
  };

  return (
    <PageShell title="Forgot your password">
      <div className="acc-page">
        <h1 className="acc-title">Choose a new password</h1>
        <p className="acc-lede">Type the email of your guest account. If there is an account for it, we email it a code.</p>
        <form className="acc-form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <ProblemBox messages={[error, problem].filter((m): m is string => m !== null)} attempt={attempt} />
          <Field label="Email" type="email" name="email" autoComplete="email" required value={email} error={error} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" busy={busy} className="acc-submit">
            Send a reset code
          </Button>
          <div className="acc-links">
            <Link to="/my/sign-in">Back to sign in</Link>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
