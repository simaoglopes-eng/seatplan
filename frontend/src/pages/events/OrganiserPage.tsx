// Route /organiser/:eventId: the organiser's workspace. Laptop first:
// the full map on the left, a side panel with four tabs on the right.
// On narrow screens the panel simply moves under the map.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ApiError } from "../../api/client";
import type { OrganiserEvent } from "../../api/events";
import { ErrorState, PageShell, Skeleton } from "../../design/components";
import { formatDateTime } from "./format";
import { GuestsTab } from "./GuestsTab";
import { OptimiseTab } from "./OptimiseTab";
import { OrganiserMap } from "./OrganiserMap";
import { PrintTab } from "./PrintTab";
import { SettingsTab } from "./SettingsTab";
import { Tabs } from "./Tabs";
import { useOrganiser } from "./useOrganiser";
import type { OrganiserState } from "./useOrganiser";
import "./events.css";

export default function OrganiserPage() {
  const { eventId = "" } = useParams();
  const org = useOrganiser(eventId);

  if (org.load.status === "loading") {
    return (
      <PageShell title="Event seating plan" width="wide">
        <div className="ev-org-layout">
          <Skeleton lines={8} label="Loading the seating plan" />
          <Skeleton lines={6} label="Loading the guest list" />
        </div>
      </PageShell>
    );
  }
  if (org.load.status === "error") {
    return (
      <PageShell title="Event seating plan">
        <OrganiserError error={org.load.error} onRetry={org.retry} />
      </PageShell>
    );
  }
  const data = org.load.data;
  return (
    <PageShell title={`${data.event.name}, seating plan`} width="wide">
      <OrganiserHeader data={data} />
      <p className="visually-hidden" role="status" aria-live="polite">
        {org.message}
      </p>
      <div className="ev-org-layout">
        <OrganiserMap org={org} data={data} />
        <SidePanel org={org} data={data} />
      </div>
    </PageShell>
  );
}

function OrganiserHeader({ data }: { data: OrganiserEvent }) {
  const coming = data.guests.filter((g) => g.rsvp !== "no");
  const seated = coming.filter((g) => g.seat_id !== null).length;
  return (
    <header className="ev-org-header">
      <div>
        <h1 className="ev-title">{data.event.name}</h1>
        <p className="ev-when">
          <time dateTime={data.event.starts_at}>{formatDateTime(data.event.starts_at)}</time>
          <span> · {data.venue.name}</span>
        </p>
      </div>
      <p className="ev-progress">
        <strong className="tabular">
          {seated} of {coming.length}
        </strong>{" "}
        guests seated
      </p>
    </header>
  );
}

function SidePanel({ org, data }: { org: OrganiserState; data: OrganiserEvent }) {
  const [tab, setTab] = useState("guests");
  const items = [
    { id: "guests", label: "Guests", content: <GuestsTab org={org} data={data} /> },
    { id: "optimise", label: "Optimise", content: <OptimiseTab org={org} data={data} /> },
    { id: "settings", label: "Settings", content: <SettingsTab org={org} data={data} /> },
    { id: "print", label: "Print", content: <PrintTab eventId={org.eventId} eventName={data.event.name} /> },
  ];
  return (
    <aside className="ev-side" aria-label="Plan tools">
      <Tabs label="Plan tools" items={items} current={tab} onChange={setTab} />
    </aside>
  );
}

function OrganiserError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.code === "unauthorised") {
    return (
      <ErrorState headingLevel={1} title="Please sign in" message="This page is for the event's organiser. Sign in and we will bring you back here.">
        <Link to={`/login?next=${encodeURIComponent(window.location.pathname)}`} className="btn btn-primary">
          Sign in
        </Link>
      </ErrorState>
    );
  }
  if (error.code === "not_found" || error.code === "forbidden") {
    return <ErrorState headingLevel={1} title="We could not find this event" message="It may have been deleted, or it belongs to another organiser. Check the link or go back to the home page." />;
  }
  return <ErrorState headingLevel={1} title="The seating plan did not load" message={error.message} onRetry={onRetry} />;
}
