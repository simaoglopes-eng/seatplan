// Route /staff/:venueId: the staff screen, laptop first. Four tabs: the live
// floor, the day's numbers, the optimiser for a whole service, and the schedule.
//
// Tabs follow the WAI-ARIA tabs pattern: one tab stop for the tab list,
// Left and Right arrows move between tabs, and each tab panel is labelled
// by its tab.
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { getRestaurant } from "../../api/restaurant";
import type { RestaurantInfo } from "../../api/restaurant";
import { PageShell } from "../../design/components";
import { formatDate, todayIso } from "./format";
import { StaffDashboard } from "./StaffDashboard";
import { StaffFloor } from "./StaffFloor";
import { StaffOptimise } from "./StaffOptimise";
import { StaffSchedule } from "./StaffSchedule";
import "./restaurant.css";
import "./staff.css";

type Tab = "floor" | "dashboard" | "optimise" | "schedule";

const TABS: { id: Tab; label: string }[] = [
  { id: "floor", label: "Floor" },
  { id: "dashboard", label: "Dashboard" },
  { id: "optimise", label: "Optimise" },
  { id: "schedule", label: "Schedule" },
];

export default function StaffPage() {
  const { venueId = "" } = useParams();
  const [tab, setTab] = useState<Tab>("floor");
  const [scheduleVisited, setScheduleVisited] = useState(false);
  const changeTab = (next: Tab): void => { if (next === "schedule") setScheduleVisited(true); setTab(next); };
  const [date, setDate] = useState(todayIso());
  const ownerEntry = useLocation().pathname.startsWith("/owner/");
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  useEffect(() => {
    let current = true;
    setRestaurant(null);
    void getRestaurant(venueId).then(info => { if (current) setRestaurant(info); }, () => undefined);
    return () => { current = false; };
  }, [venueId]);
  return (
    <PageShell title="Service floor" width="wide">
      <div className="st-page">
        <div className="st-top">
          <div>
            <Link to={ownerEntry ? "/owner" : "/"}>{ownerEntry ? "My restaurants" : "Find restaurants"}</Link>
            <p className="st-restaurant-name">{restaurant?.name ?? `Restaurant ${venueId}`}</p>
            <h1 className="st-title">Service floor</h1>
            <p className="rb-muted">{formatDate(date)}</p>
          </div>
          <label className="st-date">
            <span className="field-label">Day</span>
            <input className="field-input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
        </div>
        <TabList current={tab} onChange={changeTab} />
        {tab !== "schedule" && <div role="tabpanel" id={`st-panel-${tab}`} aria-labelledby={`st-tab-${tab}`} className="st-panel">
          {tab === "floor" && <StaffFloor key={`${venueId}|${date}`} venueId={venueId} date={date} timezone={restaurant?.timezone} onToday={() => setDate(new Intl.DateTimeFormat("sv-SE", {timeZone:restaurant?.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()))} />}
          {tab === "dashboard" && <StaffDashboard venueId={venueId} date={date} onOpenSchedule={() => {changeTab("schedule");window.requestAnimationFrame(() => document.getElementById("st-tab-schedule")?.focus());}} />}
          {tab === "optimise" && <StaffOptimise venueId={venueId} date={date} />}
        </div>}
        {scheduleVisited && <div role="tabpanel" id="st-panel-schedule" aria-labelledby="st-tab-schedule" className="st-panel" hidden={tab !== "schedule"}><StaffSchedule key={venueId} venueId={venueId} /></div>}
      </div>
    </PageShell>
  );
}

function TabList({ current, onChange }: { current: Tab; onChange: (tab: Tab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.id === current);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + step + TABS.length) % TABS.length;
    onChange(TABS[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Staff views" className="st-tabs" onKeyDown={onKeyDown}>
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`st-tab-${t.id}`}
          aria-selected={t.id === current}
          aria-controls={`st-panel-${t.id}`}
          tabIndex={t.id === current ? 0 : -1}
          className="st-tab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
