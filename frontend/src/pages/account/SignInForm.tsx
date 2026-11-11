// The guest sign-in form, used on /my/sign-in and on /j/:token/sign-in.
// It signs in (POST /guest/login) and hands the session to the page, which
// decides where to go next.
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { GuestSession } from "../../api/guest";
import { guestLogin } from "../../api/guest";
import { Button, Field } from "../../design/components";
import { ProblemBox, asApiError } from "./FormProblem";

interface SignInFormProps {
  /** Runs after a successful sign-in; may do more calls (the join page joins the event). */
  onSignedIn: (session: GuestSession) => Promise<void> | void;
  /** Links under the button, such as "Forgot your password?". */
  links: ReactNode;
}

/** Wrong email and wrong password get the same words, so nobody learns who has an account. */
function messageFor(error: unknown): string {
  const apiError = asApiError(error);
  if (apiError.code === "unauthorised") return "Email or password is not correct.";
  return apiError.message;
}

export function SignInForm({ onSignedIn, links }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAttempt((n) => n + 1);
    if (email.trim() === "" || password === "") {
      setProblem("Enter your email and your password.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await onSignedIn(await guestLogin(email.trim(), password));
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="acc-form" onSubmit={onSubmit} noValidate>
      <ProblemBox messages={problem ? [problem] : []} attempt={attempt} />
      <Field label="Email" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" busy={busy} className="acc-submit">
        Sign in
      </Button>
      <div className="acc-links">{links}</div>
    </form>
  );
}
