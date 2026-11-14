import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerOwner, verifyOwner } from "../../api/owner";
import type { OwnerCode } from "../../api/owner";
import { Button, Checkbox, Field, PageShell } from "../../design/components";
import "./owner.css";

export default function OwnerSignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<OwnerCode | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // What is wrong, by field: shown beside the field and summed up above the form.
  const [problems, setProblems] = useState<Partial<Record<"name" | "email" | "password" | "consent", string>>>({});

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!pending) {
      const found: typeof problems = {};
      if (!name.trim()) found.name = "Enter your name.";
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = "Enter a valid email address.";
      if (password.length < 10) found.password = "Use at least 10 characters.";
      if (!consent) found.consent = "Please agree to create your owner account.";
      setProblems(found);
      const first = (["name", "email", "password", "consent"] as const).find((field) => found[field]);
      if (first) {
        document.getElementById(`owner-${first}`)?.focus();
        return;
      }
    }
    setBusy(true);
    try {
      if (pending) {
        await verifyOwner(email, code, pending.signup_id);
        navigate("/owner", { replace: true });
      } else {
        setPending(await registerOwner({ name, email, password, consent: true }));
        setPassword("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Please try again.");
    } finally { setBusy(false); }
  };

  return <PageShell title="Create an owner account"><div className="owner-auth">
    <h1>{pending ? "Check your email" : "Create an owner account"}</h1>
    {pending ? <p>Enter the six-digit code sent to {email}. It expires in 15 minutes.</p> : <p>Set up your restaurant and let guests choose their table.</p>}
    <form className="owner-form" onSubmit={submit} noValidate>
      {Object.keys(problems).length > 1 && <div role="alert" className="owner-error owner-summary"><p>Please fix {Object.keys(problems).length} things:</p><ul>{(["name", "email", "password", "consent"] as const).filter((field) => problems[field]).map((field) => <li key={field}><a href={`#owner-${field}`}>{problems[field]}</a></li>)}</ul></div>}
      {!pending && <>
        <Field id="owner-name" label="Name" autoComplete="name" required maxLength={120} value={name} error={problems.name} onChange={e => setName(e.target.value)} />
        <Field id="owner-email" label="Email" type="email" autoComplete="email" required maxLength={254} value={email} error={problems.email} hint="We email you a six-digit code to confirm it is yours." onChange={e => setEmail(e.target.value)} />
        <Field id="owner-password" label="Password" type="password" autoComplete="new-password" hint="Use at least 10 characters." required minLength={10} maxLength={200} value={password} error={problems.password} onChange={e => setPassword(e.target.value)} />
        <Checkbox id="owner-consent" label="I agree to create a restaurant owner account." required checked={consent} onChange={e => setConsent(e.target.checked)} />
        {problems.consent && <p role="alert" className="owner-error">{problems.consent}</p>}
      </>}
      {pending && <>
        {pending.code_shown && <p className="owner-demo" role="status">Demo code <strong>{pending.code_shown}</strong></p>}
        <Field label="Verification code" autoFocus inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} />
      </>}
      {error && <p role="alert" className="owner-error">{error}</p>}
      <Button type="submit" busy={busy}>{pending ? "Verify and continue" : "Send verification code"}</Button>
    </form>
    {pending && <Button variant="ghost" busy={busy} onClick={() => { setPending(null); setCode(""); setError(""); }}>Request a new code</Button>}
    <p>Already have an account? <Link to="/owner/sign-in">Sign in</Link></p>
  </div></PageShell>;
}
