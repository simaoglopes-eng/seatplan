// Staff screens need a session. Instead of a bare "401", say what to do and
// bring the person straight back here after signing in.
import { Link } from "react-router-dom";
import { EmptyState } from "../../design/components";

export function SignInPrompt({ venueId }: { venueId: string }) {
  const next = encodeURIComponent(`/staff/${venueId}`);
  return (
    <EmptyState title="Please sign in to see the floor" action={<Link to={`/login?next=${next}`}>Sign in as staff</Link>}>
      <p>The staff floor shows guests' names and notes, so it is only for signed-in staff. You will come straight back here.</p>
    </EmptyState>
  );
}
