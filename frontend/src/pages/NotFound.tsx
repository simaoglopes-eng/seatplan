import { Link } from "react-router-dom";
import { EmptyState, PageShell } from "../design/components";

export default function NotFound() {
  return (
    <PageShell title="Page not found">
      <EmptyState title="This seat does not exist" action={<Link to="/">Back to the start</Link>}>
        <p>The link may be old or mistyped. Personal links from an email still work if you open them exactly as sent.</p>
      </EmptyState>
    </PageShell>
  );
}
