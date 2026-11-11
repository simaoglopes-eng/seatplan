// Route /j/:token/sign-in: someone with a guest account opened a shared link.
// They sign in, then we join them to this event (POST /j/{token}/join) and
// open their seat page, or My events with a message when joining is not possible.
import { Link, useNavigate, useParams } from "react-router-dom";
import { joinEvent } from "../../api/guest";
import { PageShell, useToast } from "../../design/components";
import { SignInForm } from "../account/SignInForm";
import { MY_HOME } from "../account/safeNext";
import { joinOutcome, statusFromError } from "./joinOutcome";
import type { JoinOutcome } from "./joinOutcome";
import "../account/account.css";

export default function JoinSignInPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const base = `/j/${encodeURIComponent(token)}`;

  const go = (outcome: JoinOutcome): void => {
    if (outcome.toast) toast.show(outcome.toast, "success");
    navigate(outcome.to, outcome.notice ? { state: { notice: outcome.notice } } : undefined);
  };

  // Signing in worked; joining is a second step that may still say no.
  const afterSignIn = async (): Promise<void> => {
    try {
      go(joinOutcome(await joinEvent(token), false));
    } catch (error) {
      const status = statusFromError(error);
      if (status) go(joinOutcome({ status, event_id: null }, false));
      else navigate(MY_HOME, { state: { notice: "You are signed in, but this link does not work any more. Ask the organiser for the current link." } });
    }
  };

  return (
    <PageShell title="Sign in to join">
      <div className="acc-page">
        <h1 className="acc-title">Sign in to join</h1>
        <p className="acc-lede">Sign in with your SeatPlan guest account. We then add you to this event, so you can choose your seat.</p>
        <SignInForm
          onSignedIn={afterSignIn}
          links={
            <>
              <Link to="/my/forgot">Forgot your password?</Link>
              <Link to={`${base}/register`}>Create an account instead</Link>
            </>
          }
        />
      </div>
    </PageShell>
  );
}
