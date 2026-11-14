import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { listOwnerRestaurants } from "../../api/owner";
import type { OwnerCard } from "../../api/owner";
import { Badge, EmptyState, ErrorState, Skeleton } from "../../design/components";
import { useLoad } from "../restaurant/useLoad";
import { OwnerShell } from "./OwnerShell";
import { PhotoPreview } from "./PhotoPreview";

/** The first thing left to do for a restaurant that is not live yet, in the owner's words, and where it is done. */
export function nextStep(card: OwnerCard): { label: string; path: string } | null {
  const steps: Record<string, { label: string; path: string }> = {
    identity: { label: "Complete the profile", path: "profile" },
    location: { label: "Pin your location", path: "profile" },
    photos: { label: "Add a cover photo", path: "photos" },
    hours: { label: "Add opening hours", path: "hours" },
    rooms: { label: "Add your first room", path: "rooms" },
    review: { label: "Review and publish", path: "review" },
  };
  const key = card.setup.missing.find((missing) => steps[missing]);
  return key ? steps[key] : null;
}

export default function OwnerHomePage() {
  const { state, reload } = useLoad(listOwnerRestaurants, "owner-restaurants");
  const signIn = state.status === "error" && state.error instanceof ApiError && [401, 403].includes(state.error.status);
  return <OwnerShell title="My restaurants" current="restaurants">
    <div className="owner-heading"><div><h1>My restaurants</h1><p className="rb-muted">Manage listings, rooms and day-to-day service.</p></div><Link className="btn btn-primary" to="/owner/new">Add a restaurant</Link></div>
    {state.status === "loading" && <Skeleton lines={4} label="Loading your restaurants" />}
    {signIn && <EmptyState title="Sign in to manage your restaurants"><p><Link to="/owner/sign-in">Sign in</Link> or <Link to="/owner/sign-up">create an owner account</Link>.</p></EmptyState>}
    {state.status === "error" && !signIn && <ErrorState title="We could not load your restaurants" message={state.error instanceof Error ? state.error.message : "Please try again."} onRetry={() => reload()} />}
    {state.status === "ready" && state.data.length === 0 && <EmptyState title="You have no restaurants yet"><p>Add your first one: it takes about 10 minutes.</p></EmptyState>}
    {state.status === "ready" && <div className="owner-cards">{state.data.map(card => <RestaurantCard key={card.public_id} card={card} />)}</div>}
  </OwnerShell>;
}

function RestaurantCard({ card }: { card: OwnerCard }) {
  const base = `/owner/${encodeURIComponent(card.public_id)}`;
  const published = card.status === "published";
  const publicPage = card.slug ? `/restaurants/${encodeURIComponent(card.slug)}` : `/r/${encodeURIComponent(card.public_id)}`;
  const complete = card.setup.done >= card.setup.total;
  const next = nextStep(card);
  return <article className="owner-card">
    {card.cover_url ? <PhotoPreview className="owner-cover" url={card.cover_url} alt="" /> : <div className="owner-cover owner-cover-empty" aria-hidden="true" />}
    <div className="owner-card-body">
      <div className="ow-card-top"><Badge tone={published ? "success" : "warning"}>{published ? "Published" : "Draft"}</Badge></div>
      <h2>{card.name}</h2>
      {/* What is next for a draft, or that the restaurant is live: one line, not a progress bar. */}
      <p className="rb-muted">{published ? "Live on SeatPlan" : next ? `Next: ${next.label}` : "Ready to publish"}</p>
      {!complete && !published && <progress value={card.setup.done} max={card.setup.total} aria-label={`${card.name} setup progress`} />}
      {/* One main action for the state the restaurant is in; everything else is a labelled second step. */}
      <div className="owner-card-main">
        {published
          ? <Link className="btn btn-primary" to={`${base}/dashboard`}>Open service floor <span aria-hidden="true">→</span><span className="visually-hidden"> for {card.name}</span></Link>
          : <Link className="btn btn-primary" to={next ? `${base}/${next.path}` : `${base}/review`}>Continue setup <span aria-hidden="true">→</span><span className="visually-hidden"> for {card.name}</span></Link>}
      </div>
      <nav className="owner-card-links ow-card-links" aria-label={`Manage ${card.name}`}>
        <Link to={`${base}/profile`}>Edit restaurant<span className="visually-hidden"> {card.name}</span></Link>
        {published && <Link to={publicPage}>View public page<span className="visually-hidden"> of {card.name}</span></Link>}
        <Link to={`${base}/review`}>{published ? "Publishing" : "Review and publish"}<span className="visually-hidden"> for {card.name}</span></Link>
        {!published && <Link to={`${base}/dashboard`}>Dashboard<span className="visually-hidden"> of {card.name}</span></Link>}
      </nav>
    </div>
  </article>;
}
