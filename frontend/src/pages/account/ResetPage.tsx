// Route /my/reset?email=...: type the emailed code and a new password.
// Success signs the person in (every other session ends) and opens My events.
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../../api/guest";
import { Badge, Button, Field, PageShell, useToast } from "../../design/components";
import type { ResetState } from "./ForgotPage";
import { ProblemBox, asApiError, listErrors, looksLikeEmail, splitFieldMessage } from "./FormProblem";
import type { FieldErrors } from "./FormProblem";
import { PasswordToggle } from "./PasswordToggle";
import { MY_HOME } from "./safeNext";
import "./account.css";

const MIN_PASSWORD = 10;

/** Checks the three fields before they are sent. */
export function validateReset(email: string, code: string, password: string): FieldErrors {
  return {
    email: looksLikeEmail(email) ? null : "Enter an email address like name@example.com.",
    code: /^[0-9]{6}$/.test(code) ? null : "Enter the 6 digits from the email.",
    new_password: password.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : null,
  };
}

export default function ResetPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const sentState = (useLocation().state ?? null) as ResetState | null;
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAttempt((n) => n + 1);
    setProblem(null);
    const found = validateReset(email, code, password);
    setErrors(found);
    if (listErrors(found).length > 0) return;
    setBusy(true);
    try {
      await resetPassword(email.trim(), code, password);
      toast.show("Your new password is saved. You are signed in.", "success");
      navigate(MY_HOME);
    } catch (caught) {
      const apiError = asApiError(caught);
      if (apiError.code === "not_found") setErrors({ code: apiError.message });
      else if (apiError.code === "validation") {
        const { field, text } = splitFieldMessage(apiError.message, ["email", "code", "new_password"]);
        setErrors({ [field ?? "code"]: text });
      } else setProblem(apiError.message);
      setBusy(false);
    }
  };

  return (
    <PageShell title="Choose a new password">
      <div className="acc-page">
        <h1 className="acc-title">Choose a new password</h1>
        {sentState?.sentTo && <p>If there is an account for {sentState.sentTo}, we sent it a code. It works for 15 minutes.</p>}
        {sentState?.demoCode && <Badge tone="info">Demo only: your code is {sentState.demoCode}</Badge>}
        <form className="acc-form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <ProblemBox messages={[...listErrors(errors), ...(problem ? [problem] : [])]} attempt={attempt} />
          <Field label="Email" type="email" name="email" autoComplete="email" required value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
          <Field
            label="Code"
            hint="6 digits"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            error={errors.code}
            onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
          />
          <div className="acc-password">
            <Field
              id="reset-password"
              label="New password"
              hint={`At least ${MIN_PASSWORD} characters.`}
              type={showPassword ? "text" : "password"}
              name="new_password"
              autoComplete="new-password"
              required
              maxLength={200}
              value={password}
              error={errors.new_password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordToggle shown={showPassword} controls="reset-password" onToggle={() => setShowPassword((v) => !v)} />
          </div>
          <Button type="submit" busy={busy} className="acc-submit">
            Save and sign in
          </Button>
          <div className="acc-links">
            <Link to="/my/forgot">Send a new code</Link>
            <Link to="/my/sign-in">Back to sign in</Link>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
