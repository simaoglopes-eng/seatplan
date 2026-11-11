// Route /my/sign-in: a guest account holder signs in. Afterwards we go to
// the page they came from (?next=), but only when it is a /my/ page
// (safeNext), so a link cannot send them to another website.
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageShell, useToast } from "../../design/components";
import { SignInForm } from "./SignInForm";
import { MY_HOME, safeNext } from "./safeNext";
import "./account.css";

export default function GuestSignInPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  return (
    <PageShell title="Guest sign in">
      <div className="acc-page">
        <h1 className="acc-title">Sign in to see your seat</h1>
        <p className="acc-lede">
          For guests who made a SeatPlan account. Organisers sign in on the <Link to="/login">organiser page</Link>.
        </p>
        <SignInForm
          onSignedIn={(session) => {
            toast.show(`Welcome back, ${session.account.name}.`, "success");
            navigate(safeNext(params.get("next")) ?? MY_HOME);
          }}
          links={<Link to="/my/forgot">Forgot your password?</Link>}
        />
      </div>
    </PageShell>
  );
}
