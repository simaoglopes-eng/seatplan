import { Link } from "react-router-dom";
import { ApiError, logout } from "../../api/client";
import { listOwnerRestaurants } from "../../api/owner";
import type { OwnerCard } from "../../api/owner";
import { Badge, EmptyState, ErrorState, PageShell, Skeleton } from "../../design/components";
import { useLoad } from "../restaurant/useLoad";
import "./owner.css";

export default function OwnerHomePage() {
  const { state, reload } = useLoad(listOwnerRestaurants, "owner-restaurants");
  const signIn = state.status === "error" && state.error instanceof ApiError && [401, 403].includes(state.error.status);
  return <PageShell title="My restaurants" headerActions={<Link to="/owner/sign-in" onClick={() => logout()}>Sign out</Link>}>
    <div className="owner-heading"><h1>My restaurants</h1><Link className="btn btn-primary" to="/owner/new">Add a restaurant</Link></div>
    {state.status === "loading" && <Skeleton lines={4} label="Loading your restaurants" />}
    {signIn && <EmptyState title="Sign in to manage your restaurants"><p><Link to="/owner/sign-in">Sign in</Link> or <Link to="/owner/sign-up">create an owner account</Link>.</p></EmptyState>}
    {state.status === "error" && !signIn && <ErrorState title="We could not load your restaurants" message={state.error instanceof Error ? state.error.message : "Please try again."} onRetry={() => reload()} />}
    {state.status === "ready" && state.data.length === 0 && <EmptyState title="You have no restaurants yet"><p>Add your first one: it takes about 10 minutes.</p></EmptyState>}
    {state.status === "ready" && <div className="owner-cards">{state.data.map(card => <RestaurantCard key={card.public_id} card={card} />)}</div>}
  </PageShell>;
}

function RestaurantCard({ card }: { card: OwnerCard }) {
  const base = `/owner/${encodeURIComponent(card.public_id)}`;
  return <article className="owner-card">
    {card.cover_url ? <img className="owner-cover" src={card.cover_url} alt="" loading="lazy" /> : <div className="owner-cover owner-cover-empty" aria-hidden="true" />}
    <div className="owner-card-body"><Badge tone={card.status === "published" ? "success" : "neutral"}>{card.status === "published" ? "Published" : "Draft"}</Badge>
      <h2>{card.name}</h2><p>Setup {card.setup.done} of {card.setup.total} done</p>
      <progress value={card.setup.done} max={card.setup.total} aria-label={`${card.name} setup progress`} />
      <nav className="owner-card-links" aria-label={`Manage ${card.name}`}>
        <Link to={`${base}/profile`}>Edit profile</Link><Link to={`${base}/rooms`}>Edit rooms</Link><Link to={`${base}/hours`}>Opening hours</Link><Link to={`${base}/dashboard`}>Dashboard</Link>
        {card.status === "published" && <Link to={card.slug ? `/restaurants/${encodeURIComponent(card.slug)}` : `/r/${encodeURIComponent(card.public_id)}`}>View public page</Link>}
      </nav>
    </div>
  </article>;
}
