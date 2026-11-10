// Guests tab: who has not chosen yet (shown first, because that is the
// organiser's main worry), search, the list, and the tools to add, import
// and export guests.
import { useState } from "react";
import * as eventsApi from "../../api/events";
import type { OrganiserEvent, OrganiserGuest } from "../../api/events";
import { Button, EmptyState, Field, Select } from "../../design/components";
import { AddGuestForm } from "./AddGuestForm";
import { bringMapIntoView, copyText, downloadText, fullLink } from "./browserHelpers";
import { seatName } from "./format";
import { GuestRow } from "./GuestRow";
import { ImportCsv } from "./ImportCsv";
import type { OrganiserState } from "./useOrganiser";

type Filter = "all" | "unseated" | "not_chosen" | "seated";

const FILTERS = [
  { value: "unseated", label: "Not seated yet" },
  { value: "not_chosen", label: "Did not choose themselves" },
  { value: "all", label: "Everyone" },
  { value: "seated", label: "Seated" },
];

function keep(guest: OrganiserGuest, filter: Filter, notChosen: Set<number>): boolean {
  if (filter === "unseated") return guest.seat_id === null && guest.rsvp !== "no";
  if (filter === "not_chosen") return notChosen.has(guest.id);
  if (filter === "seated") return guest.seat_id !== null;
  return true;
}

function visibleGuests(data: OrganiserEvent, filter: Filter, query: string): OrganiserGuest[] {
  const needle = query.trim().toLowerCase();
  const notChosen = new Set(data.not_chosen.map((item) => item.guest_id));
  return data.guests.filter((g) => keep(g, filter, notChosen) && g.name.toLowerCase().includes(needle));
}

export function GuestsTab({ org, data }: { org: OrganiserState; data: OrganiserEvent }) {
  const [filter, setFilter] = useState<Filter>("unseated");
  const [query, setQuery] = useState("");
  const shown = visibleGuests(data, filter, query);
  const waiting = visibleGuests(data, "unseated", "").length;

  return (
    <div className="ev-panel-stack">
      <p className="ev-summary">
        <strong>{waiting}</strong> {waiting === 1 ? "guest has" : "guests have"} no seat yet.
      </p>
      <p className="ev-muted">
        {data.not_chosen.length} coming {data.not_chosen.length === 1 ? "guest has" : "guests have"} not picked a seat themselves (some
        were placed by you or the optimiser).
      </p>
      <p className="ev-muted">To seat someone: press Place, then choose a seat on the map. Or drag their name onto a seat.</p>
      <div className="ev-filters">
        <Select label="Show" options={FILTERS} value={filter} onChange={(e) => setFilter(e.target.value as Filter)} />
        <Field label="Search guests" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      </div>
      <GuestList org={org} data={data} guests={shown} filter={filter} />
      <AddGuestForm org={org} />
      <ImportCsv org={org} />
      <ExportButton org={org} />
    </div>
  );
}

interface GuestListProps {
  org: OrganiserState;
  data: OrganiserEvent;
  guests: OrganiserGuest[];
  filter: Filter;
}

function GuestList({ org, data, guests, filter }: GuestListProps) {
  if (guests.length === 0) {
    const title = filter === "unseated" ? "Everyone has a seat" : "No guests here";
    return <EmptyState title={title}>{filter === "unseated" ? <p>Nice work. Switch the filter to see everyone.</p> : <p>Try another name or filter.</p>}</EmptyState>;
  }
  const copy = async (guest: OrganiserGuest, link: string): Promise<void> => {
    const ok = await copyText(fullLink(link));
    org.announce(ok ? `Copied ${guest.name}'s link.` : `Could not copy automatically. ${guest.name}'s link: ${fullLink(link)}`);
  };
  return (
    <ul className="ev-guests" aria-label="Guests">
      {guests.map((guest) => (
        <GuestRow
          key={guest.id}
          guest={guest}
          seatLabel={guest.seat_id === null ? null : seatName(guest.seat_id, data.map.seats, data.map.tables)}
          selected={org.selectedGuest === guest.id}
          link={org.links[guest.id]}
          busy={org.busy}
          onPlace={() => placeGuest(org, guest)}
          onCopyLink={() => void copy(guest, org.links[guest.id])}
          onNewLink={() =>
            org.run(`link-${guest.id}`, `New link made for ${guest.name}. The old one no longer works.`, async () => {
              const answer = await eventsApi.newGuestLink(org.eventId, guest.id);
              org.rememberLink(guest.id, answer.link);
            })
          }
          onDelete={() => org.run(`delete-${guest.id}`, `${guest.name}'s data was deleted.`, () => eventsApi.deleteGuest(org.eventId, guest.id).then(() => undefined))}
        />
      ))}
    </ul>
  );
}

/** "Place" toggles: press again to stop placing this guest. */
function placeGuest(org: OrganiserState, guest: OrganiserGuest): void {
  if (org.selectedGuest === guest.id) {
    org.setSelectedGuest(null);
    org.announce(`Stopped placing ${guest.name}.`);
    return;
  }
  org.setSelectedGuest(guest.id);
  const moved = bringMapIntoView(org.mapRef.current);
  org.announce(`Placing ${guest.name}. Now choose a free seat on the map${moved ? ", which now has the focus" : ""}.`);
}

function ExportButton({ org }: { org: OrganiserState }) {
  const [busy, setBusy] = useState(false);
  const onExport = async (): Promise<void> => {
    setBusy(true);
    try {
      const csv = await eventsApi.exportGuestsCsv(org.eventId);
      const saved = downloadText("guests.csv", csv, "text/csv");
      org.announce(saved ? "Guest list downloaded as guests.csv." : "Your browser could not save the file.");
    } catch {
      org.announce("Problem: the export did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ev-form">
      <h3 className="ev-subtitle">Export</h3>
      <Button variant="secondary" busy={busy} onClick={() => void onExport()}>
        Download guest list (CSV)
      </Button>
    </div>
  );
}
