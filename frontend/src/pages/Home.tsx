// Home: explain SeatPlan in one screen and offer one-click demo entry points.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, getDemoLinks } from "../api/client";
import { EmptyState, ErrorState, Legend, PageShell, Skeleton } from "../design/components";
import { SeatMap } from "../seatmap/SeatMap";
import { demoEntries } from "./demoLinks";
import type { DemoEntry, DemoGroup } from "./demoLinks";
import { SAMPLE_RECOMMENDED, buildSampleFloor } from "./homeSample";
import "./home.css";

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; links: DemoEntry[] };

function useDemoLinks(): { state: LoadState; reload: () => void } {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const load = useCallback(() => {
    setState({ kind: "loading" });
    getDemoLinks()
      .then((data) => setState({ kind: "ready", links: demoEntries(data.links ?? {}) }))
      .catch((error: unknown) => {
        // The backend answers 404 when DEMO_MODE is off: that is "no demo", not a failure.
        if (error instanceof ApiError && error.code === "not_found") {
          setState({ kind: "ready", links: [] });
          return;
        }
        const message = error instanceof ApiError ? error.message : "The demo links could not be loaded.";
        setState({ kind: "error", message });
      });
  }, []);
  useEffect(load, [load]);
  return { state, reload: load };
}

export default function Home() {
  const { state, reload } = useDemoLinks();
  return (
    <PageShell title="Choose your seat" headerActions={<Link to="/login" className="btn btn-ghost">Organiser sign in</Link>}>
      <Hero />
      <section className="home-demo" aria-labelledby="demo-heading">
        <h2 id="demo-heading">Open the live demo</h2>
        <p className="home-muted">Each link opens the demo as a different person. Open two in separate windows to watch seats change live.</p>
        <DemoLinks state={state} reload={reload} />
      </section>
      <HowItWorks />
    </PageShell>
  );
}

function Hero() {
  const floor = useMemo(buildSampleFloor, []);
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <section className="home-hero" aria-labelledby="hero-heading">
      <div className="home-hero-text">
        <p className="home-eyebrow">Events and restaurants</p>
        <h1 id="hero-heading">Pick your own seat, next to the people you know.</h1>
        <p className="home-lede">
          SeatPlan shows the room as it really is, live. Guests choose a seat or a table themselves; a planner suggests the best
          spots and explains why; and the database makes sure no seat is ever given out twice.
        </p>
        <Legend states={["free", "held", "taken", "friend", "blocked"]} showAccessible showRecommended />
      </div>
      <div className="home-hero-map">
        <SeatMap
          label="Sample seat map, try choosing a seat"
          tables={floor.tables}
          seats={floor.seats}
          highlight={SAMPLE_RECOMMENDED}
          selectedId={selected}
          onSelect={setSelected}
        />
      </div>
    </section>
  );
}

const GROUPS: { key: DemoGroup; title: string; blurb: string }[] = [
  { key: "events", title: "Events", blurb: "Choose a seat from your personal invitation, or plan the whole room as the organiser." },
  { key: "restaurant", title: "Restaurant", blurb: "Book a table for a date and time, or run the floor as staff during service." },
  { key: "tools", title: "Venue tools", blurb: "Draw and change the floor plan that both kinds of venue use." },
];

function DemoLinks({ state, reload }: { state: LoadState; reload: () => void }) {
  if (state.kind === "loading") return <Skeleton lines={4} label="Loading demo links" />;
  if (state.kind === "error") return <ErrorState title="The demo is not reachable" message={state.message} onRetry={reload} />;
  if (state.links.length === 0) {
    return (
      <EmptyState title="The demo is switched off">
        <p>This server runs without demo data. Ask an organiser to sign in and create a venue.</p>
      </EmptyState>
    );
  }
  return (
    <div className="home-cards">
      {GROUPS.map((group) => {
        const links = state.links.filter((l) => l.group === group.key);
        // The two verticals always show (even when empty); the tools card only when it has links.
        if (group.key === "tools" && links.length === 0) return null;
        return <DemoCard key={group.key} title={group.title} blurb={group.blurb} links={links} />;
      })}
    </div>
  );
}

// One short sentence per kind of page, chosen by the start of the path. The
// path itself is not printed: personal links end in a 43-character secret
// token, which is unreadable and has no place to wrap on a phone.
const LINK_DESCRIPTIONS: [prefix: string, words: string][] = [
  ["/e/", "Opens one guest's personal invitation"],
  ["/organiser/", "Plans the whole room as the organiser"],
  ["/r/", "Books a table as a diner"],
  ["/restaurants/", "Opens the public page of a demo restaurant"],
  ["/b/", "Changes or cancels an existing booking"],
  ["/staff/", "Runs the dining room during service"],
  ["/editor/", "Draws and changes the floor plan"],
];

function linkDescription(path: string): string {
  return LINK_DESCRIPTIONS.find(([prefix]) => path.startsWith(prefix))?.[1] ?? "Opens this part of the demo";
}

function DemoCard({ title, blurb, links }: { title: string; blurb: string; links: DemoEntry[] }) {
  return (
    <article className="home-card">
      <h3>{title}</h3>
      <p className="home-muted">{blurb}</p>
      {links.length === 0 ? (
        <p className="home-muted">No demo links for this part yet.</p>
      ) : (
        <ul className="home-links">
          {links.map((link) => (
            <li key={link.name}>
              <Link to={link.path} className="home-link">
                <span className="home-link-label">{link.label}</span>
                <span className="home-link-desc">{linkDescription(link.path)}</span>
                <span className="home-link-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

const STEPS = [
  { title: "See the room", body: "A live map of tables and seats. Changes from other people appear within a second or two." },
  { title: "Get a suggestion", body: "The planner recommends seats near people you know, and tells you why in plain words." },
  { title: "Hold, then confirm", body: "Your seat is held for five minutes while you decide. Nobody else can take it meanwhile." },
];

function HowItWorks() {
  return (
    <section className="home-how" aria-labelledby="how-heading">
      <h2 id="how-heading">How it works</h2>
      <ol className="home-steps">
        {STEPS.map((step) => (
          <li key={step.title}>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
