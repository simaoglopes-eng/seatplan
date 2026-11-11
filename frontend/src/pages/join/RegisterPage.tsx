// Route /j/:token/register: a visitor creates a guest account to choose a seat.
//
// Two steps on one page:
// 1. the form (name, email, password, consent) -> POST /j/{token}/register,
//    which emails a 6-digit code (the answer is the same whether or not the
//    address already has an account, so nobody can find out who has one);
// 2. the code -> POST /guest/verify, which makes the account, signs in and
//    tries to join the event. joinOutcome() decides where to go next.
// Nothing is stored for the event until the code is typed (docs/guest-accounts.md D1).
import { useEffect, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { register, verifyCode } from "../../api/guest";
import type { CodeSent, RegisterIn } from "../../api/guest";
import { Badge, Button, Checkbox, Field, PageShell, useToast } from "../../design/components";
import { FieldError } from "../../design/components/Field";
import { ProblemBox, asApiError, listErrors, looksLikeEmail, splitFieldMessage } from "../account/FormProblem";
import type { FieldErrors } from "../account/FormProblem";
import { PasswordToggle } from "../account/PasswordToggle";
import { PrivacyText } from "../account/PrivacyText";
import { joinOutcome } from "./joinOutcome";
import "../account/account.css";
import "./join.css";

export interface RegisterValues {
  name: string;
  email: string;
  password: string;
  needsAccessible: boolean;
  consent: boolean;
}

const EMPTY: RegisterValues = { name: "", email: "", password: "", needsAccessible: false, consent: false };
const FIELDS = ["name", "email", "password", "consent"] as const;
/** The same rule as the server (section 6.2). */
export const MIN_PASSWORD = 10;
/** "Send a new code" waits this long, so nobody floods their own inbox by accident. */
const RESEND_SECONDS = 30;

/** Checks the form before it is sent. The server checks everything again. */
export function validateRegister(values: RegisterValues): FieldErrors {
  const email = values.email.trim();
  return {
    name: values.name.trim() === "" ? "Enter your name." : null,
    email: email === "" ? "Enter your email address." : looksLikeEmail(email) ? null : "Enter an email address like name@example.com.",
    password:
      values.password.length < MIN_PASSWORD
        ? `Use at least ${MIN_PASSWORD} characters.`
        : values.password.trim().toLowerCase() === email.toLowerCase()
          ? "Choose a password that is not your email address."
          : null,
    consent: values.consent ? null : "Tick the box to agree, so we can store your details and email you your seat.",
  };
}

function toBody(values: RegisterValues): RegisterIn {
  return { name: values.name.trim(), email: values.email.trim(), password: values.password, needs_accessible: values.needsAccessible, consent: true };
}

/** Counts down once a second; `start` begins a new countdown. */
function useCooldown(): [number, (seconds: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return undefined;
    const timer = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);
  return [left, setLeft];
}

export default function RegisterPage() {
  const { token = "" } = useParams();
  const [values, setValues] = useState<RegisterValues>(EMPTY);
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cooldown, startCooldown] = useCooldown();
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Focus follows the step: the new heading takes focus, but never on page load.
  const step = sent ? "code" : "form";
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Only the end of the countdown is announced, never every second.
  useEffect(() => {
    if (sent && cooldown === 0 && attempt > 0) setStatus("You can ask for a new code now.");
  }, [cooldown, sent, attempt]);

  const sendCode = async (): Promise<boolean> => {
    setBusy(true);
    setGeneral(null);
    try {
      setSent(await register(token, toBody(values)));
      startCooldown(RESEND_SECONDS);
      return true;
    } catch (error) {
      const apiError = asApiError(error);
      const { field, text } = apiError.code === "validation" ? splitFieldMessage(apiError.message, FIELDS) : { field: null, text: apiError.message };
      if (field) setErrors((current) => ({ ...current, [field]: text }));
      else setGeneral(text);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSubmitForm = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAttempt((n) => n + 1);
    const found = validateRegister(values);
    setErrors(found);
    setGeneral(null);
    if (listErrors(found).length > 0) return;
    await sendCode();
  };

  const resend = async (): Promise<void> => {
    setAttempt((n) => n + 1);
    if (await sendCode()) setStatus("We sent a new code.");
  };

  const differentEmail = (): void => {
    setSent(null);
    setValues((current) => ({ ...current, password: "" }));
    setErrors({});
    setGeneral(null);
    setStatus("");
  };

  return (
    <PageShell title="Create your account">
      <div className="acc-page">
        <p className="visually-hidden" role="status" aria-live="polite">
          {status}
        </p>
        {sent ? (
          <CodeStep
            headingRef={headingRef}
            sent={sent}
            email={values.email.trim()}
            cooldown={cooldown}
            busyResend={busy}
            problem={general}
            attempt={attempt}
            onResend={() => void resend()}
            onDifferentEmail={differentEmail}
          />
        ) : (
          <RegisterForm
            token={token}
            headingRef={headingRef}
            values={values}
            errors={errors}
            general={general}
            attempt={attempt}
            busy={busy}
            onChange={(changes) => setValues((current) => ({ ...current, ...changes }))}
            onSubmit={onSubmitForm}
          />
        )}
      </div>
    </PageShell>
  );
}

interface RegisterFormProps {
  token: string;
  headingRef: RefObject<HTMLHeadingElement>;
  values: RegisterValues;
  errors: FieldErrors;
  general: string | null;
  attempt: number;
  busy: boolean;
  onChange: (changes: Partial<RegisterValues>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

/** Step 1: one column, every field with a visible label and a hint. */
function RegisterForm({ token, headingRef, values, errors, general, attempt, busy, onChange, onSubmit }: RegisterFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const problems = [...listErrors(errors), ...(general ? [general] : [])];
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="acc-title">
        Create your account
      </h1>
      <p className="acc-lede">With an account you can choose your seat, and we email you your seat with a picture of the room.</p>
      <form className="acc-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <ProblemBox messages={problems} attempt={attempt} />
        <p className="ev-muted">All fields are needed.</p>
        <Field
          label="Your name"
          hint="The organiser sees it. Other guests see it as the organiser's privacy setting allows."
          name="name"
          autoComplete="name"
          required
          maxLength={120}
          value={values.name}
          error={errors.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <Field
          label="Email"
          hint="We email you a code to check it is yours, then your seat."
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={254}
          value={values.email}
          error={errors.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
        <div className="acc-password">
          <Field
            id="reg-password"
            label="Password"
            hint={`At least ${MIN_PASSWORD} characters.`}
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="new-password"
            required
            maxLength={200}
            value={values.password}
            error={errors.password}
            onChange={(e) => onChange({ password: e.target.value })}
          />
          <PasswordToggle shown={showPassword} controls="reg-password" onToggle={() => setShowPassword((v) => !v)} />
        </div>
        <Checkbox label="I need an accessible seat" checked={values.needsAccessible} onChange={(e) => onChange({ needsAccessible: e.target.checked })} />
        <ConsentBox checked={values.consent} error={errors.consent} onChange={(consent) => onChange({ consent })} />
        <Button type="submit" busy={busy} className="acc-submit">
          Send my code
        </Button>
        <div className="acc-links">
          <Link to={`/j/${encodeURIComponent(token)}/sign-in`}>I already have an account</Link>
          <Link to={`/j/${encodeURIComponent(token)}`}>Back to the event</Link>
        </div>
      </form>
    </>
  );
}

interface ConsentBoxProps {
  checked: boolean;
  error: string | null | undefined;
  onChange: (checked: boolean) => void;
}

/** The one required tick box, its error, and the privacy text behind "What we store". */
function ConsentBox({ checked, error, onChange }: ConsentBoxProps) {
  return (
    <div className={`acc-consent ${error ? "field-invalid" : ""}`.trim()}>
      <div className="checkbox">
        <input
          id="reg-consent"
          type="checkbox"
          className="checkbox-input"
          required
          checked={checked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "reg-consent-error" : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor="reg-consent" className="checkbox-label">
          I agree that SeatPlan stores my details to manage my seat and emails me about it. (required)
        </label>
      </div>
      {error && <FieldError id="reg-consent-error" message={error} />}
      <details className="acc-details">
        <summary>What we store</summary>
        <PrivacyText />
      </details>
    </div>
  );
}

interface CodeStepProps {
  headingRef: RefObject<HTMLHeadingElement>;
  sent: CodeSent;
  email: string;
  cooldown: number;
  busyResend: boolean;
  problem: string | null;
  attempt: number;
  onResend: () => void;
  onDifferentEmail: () => void;
}

/** Step 2: type the 6 digits from the email. */
function CodeStep({ headingRef, sent, email, cooldown, busyResend, problem, attempt, onResend, onDifferentEmail }: CodeStepProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [general, setGeneral] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setTries((n) => n + 1);
    setGeneral(null);
    if (!/^[0-9]{6}$/.test(code)) {
      setCodeError("Enter the 6 digits from the email.");
      return;
    }
    setCodeError(null);
    setBusy(true);
    try {
      const result = await verifyCode(email, code, sent.signup_id ?? "");
      const outcome = joinOutcome(result.join, true);
      if (outcome.toast) toast.show(outcome.toast, "success");
      navigate(outcome.to, outcome.notice ? { state: { notice: outcome.notice } } : undefined);
    } catch (error) {
      const apiError = asApiError(error);
      // Wrong or expired code: the message belongs to the code field. Anything else goes on top.
      if (apiError.code === "validation" || apiError.code === "not_found") setCodeError(apiError.message);
      else setGeneral(apiError.code === "conflict" ? "Please try again." : apiError.message);
      setBusy(false);
    }
  };

  const problems = [...(codeError ? [codeError] : []), ...(general ? [general] : []), ...(problem ? [problem] : [])];
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="acc-title">
        Check your email
      </h1>
      <p>
        We sent a 6-digit code to <strong>{sent.sent_to}</strong>. It works for 15 minutes. If you already have an account with this
        address, we sent a sign-in reminder instead.
      </p>
      {sent.demo_code && <Badge tone="info">Demo only: your code is {sent.demo_code}</Badge>}
      <form className="acc-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <ProblemBox messages={problems} attempt={tries + attempt} />
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
          error={codeError}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
        />
        <Button type="submit" busy={busy} className="acc-submit">
          Create my account
        </Button>
      </form>
      <div className="acc-links">
        <Button variant="ghost" disabled={cooldown > 0} busy={busyResend} onClick={onResend}>
          Send a new code
          {cooldown > 0 && <span aria-hidden="true"> (in {cooldown} s)</span>}
        </Button>
        <Button variant="ghost" onClick={onDifferentEmail}>
          Use a different email
        </Button>
      </div>
    </>
  );
}
