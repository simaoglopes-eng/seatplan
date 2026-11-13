// The home page (spec 9.1): search restaurants by name or cuisine, near me or in a
// city, with filters and an optional "When?", as a list with a map beside it
// (a List/Map switch on a phone). Twenty at a time, "Show more" for the rest.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { searchRestaurants } from "../../api/discovery";
import type { FeatureKey, RestaurantCard as Card, SearchQuery } from "../../api/discovery";
import { CUISINES } from "../../api/owner";
import { Button, EmptyState, ErrorState, Field, PageShell, Select, Skeleton } from "../../design/components";
import { errorMessage } from "../restaurant/format";
import { PublicHeaderActions } from "./PublicHeaderActions";
import { RestaurantCard } from "./RestaurantCard";
import { CITIES, FEATURE_KEYS, FEATURE_LABELS, completeWhen, cuisineLabel, loadPlace, savePlace } from "./discoverModel";
import type { Place } from "./discoverModel";
import "./discover.css";

const ResultsMap = lazy(() => import("../../maps/ResultsMap"));
const PAGE = 20;
const PARTIES = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? "1 person" : `${i + 1} people` }));

type Results = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: Card[]; total: number };

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`;
}

function useWide(): boolean {
  const query = "(min-width: 60rem)";
  const [wide, setWide] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const change = (): void => setWide(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return wide;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function DiscoverPage() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [prices, setPrices] = useState<number[]>([]);
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [place, setPlace] = useState<Place | null>(loadPlace);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");
  const [whenOpen, setWhenOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [party, setParty] = useState("2");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [results, setResults] = useState<Results>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const wide = useWide();
  const request = useRef(0);

  // The search box waits for a pause in typing before it asks the server.
  useEffect(() => {
    const id = window.setTimeout(() => setQ(text), 300);
    return () => window.clearTimeout(id);
  }, [text]);

  const when = whenOpen ? completeWhen(date, time, Number(party)) : null;
  const query: SearchQuery = useMemo(
    () => ({ q, cuisines, prices, features, place: place ? { lat: place.lat, lng: place.lng } : null, when, availableOnly: availableOnly && when !== null, limit: PAGE, offset: 0 }),
    // `when` is rebuilt every render, so depend on its parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, cuisines, prices, features, place, whenOpen, date, time, party, availableOnly],
  );
  const queryKey = JSON.stringify(query);

  const search = useCallback((): void => {
    const id = ++request.current;
    setResults((now) => (now.status === "ready" ? now : { status: "loading" }));
    setMoreError("");
    searchRestaurants(query).then(
      (answer) => id === request.current && setResults({ status: "ready", items: answer.items, total: answer.total }),
      (error: unknown) => id === request.current && setResults({ status: "error", message: errorMessage(error, "We could not load the restaurants. Please try again.") }),
    );
    // The key stands for the whole query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);
  useEffect(search, [search]);

  const showMore = async (): Promise<void> => {
    if (results.status !== "ready") return;
    const id = ++request.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const answer = await searchRestaurants({ ...query, offset: results.items.length });
      if (id === request.current) setResults({ status: "ready", items: [...results.items, ...answer.items], total: answer.total });
    } catch (error) {
      if (id === request.current) setMoreError(errorMessage(error, "We could not load more. Please try again."));
    } finally {
      setLoadingMore(false);
    }
  };

  const choosePlace = (next: Place | null): void => {
    setPlace(next);
    savePlace(next);
  };
  const nearMe = (): void => {
    setLocationNote("");
    if (!("geolocation" in navigator)) {
      setLocationNote("Your browser cannot tell us where you are. Choose a city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        choosePlace({ label: "Near me", lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setLocating(false);
          setLocationNote("We could not get your location. Choose a city instead.");
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const openWhen = (): void => {
    if (!whenOpen) {
      setDate(today());
      setTime("20:00");
      setParty("2");
    }
    setWhenOpen(!whenOpen);
  };

  const filterCount = cuisines.length + prices.length + features.length;
  const clearFilters = (): void => {
    setText("");
    setQ("");
    setCuisines([]);
    setPrices([]);
    setFeatures([]);
    setAvailableOnly(true);
  };

  const items = results.status === "ready" ? results.items : [];
  const pins = useMemo(
    () => items.filter((c) => c.lat !== null && c.lng !== null).map((c) => ({ id: c.public_id, name: c.name, lat: c.lat as number, lng: c.lng as number })),
    [items],
  );
  const selectPin = (id: string): void => {
    setHighlighted(id);
    const card = document.getElementById(`card-${id}`);
    if (view === "map") setView("list");
    window.setTimeout(() => card?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }), 0);
  };
  const showMap = wide || view === "map";

  return (
    <PageShell title="Find a table you will love" width="wide" headerActions={<PublicHeaderActions />}>
      <section className="discover-top" aria-labelledby="discover-heading">
        <h1 id="discover-heading">Find a table you will love</h1>
        <p className="discover-lede">See the room, the light and the view before you book.</p>
        <form className="discover-search" role="search" onSubmit={(event) => event.preventDefault()}>
          <Field label="Restaurant or cuisine" type="search" value={text} onChange={(event) => setText(event.target.value)} maxLength={80} autoComplete="off" />
          <div className="discover-search-buttons">
            <Button variant="secondary" busy={locating} onClick={nearMe}>
              Near me
            </Button>
            <Button variant="secondary" aria-expanded={whenOpen} onClick={openWhen}>
              When?
            </Button>
          </div>
        </form>

        {place?.label !== "Near me" && (
          <div className="discover-place">
            <Select
              label="Choose a city"
              value={place && place.label !== "Near me" ? place.label : ""}
              options={[{ value: "", label: "Anywhere" }, ...CITIES.map((c) => ({ value: c.label, label: c.label }))]}
              onChange={(event) => choosePlace(CITIES.find((c) => c.label === event.target.value) ?? null)}
            />
          </div>
        )}
        {locationNote && <p role="status">{locationNote}</p>}
        {place?.label === "Near me" && (
          <p role="status" className="discover-near">
            Sorted by distance from where you are. <Button variant="ghost" onClick={() => choosePlace(null)}>Stop using my location</Button>
          </p>
        )}

        {whenOpen && (
          <fieldset className="discover-when">
            <legend>When?</legend>
            <Field label="Date" type="date" min={today()} value={date} onChange={(event) => setDate(event.target.value)} />
            <Field label="Time" type="time" step={900} value={time} onChange={(event) => setTime(event.target.value)} />
            <Select label="People" value={party} options={PARTIES} onChange={(event) => setParty(event.target.value)} />
            {when === null && <p className="rb-muted">Fill in the date, time and people to see free times.</p>}
          </fieldset>
        )}

        <div className="discover-filters-bar">
          <Button variant="secondary" className="discover-filters-toggle" aria-expanded={filtersOpen} aria-controls="discover-filters" onClick={() => setFiltersOpen((v) => !v)}>
            Filters{filterCount > 0 ? ` (${filterCount})` : ""}
          </Button>
        </div>
        <div id="discover-filters" className={`discover-filters${filtersOpen ? " is-open" : ""}`}>
          <Chips label="Cuisine">
            {CUISINES.map((key) => (
              <Chip key={key} pressed={cuisines.includes(key)} onClick={() => setCuisines(toggle(cuisines, key))}>
                {cuisineLabel(key)}
              </Chip>
            ))}
          </Chips>
          <Chips label="Price">
            {[1, 2, 3, 4].map((level) => (
              <Chip key={level} pressed={prices.includes(level)} label={`${"€".repeat(level)}, price level ${level} of 4`} onClick={() => setPrices(toggle(prices, level))}>
                {"€".repeat(level)}
              </Chip>
            ))}
          </Chips>
          <Chips label="Features">
            {FEATURE_KEYS.map((key) => (
              <Chip key={key} pressed={features.includes(key)} onClick={() => setFeatures(toggle(features, key))}>
                {FEATURE_LABELS[key]}
              </Chip>
            ))}
            {when && (
              <Chip pressed={availableOnly} onClick={() => setAvailableOnly(!availableOnly)}>
                Available at that time
              </Chip>
            )}
          </Chips>
        </div>
      </section>

      <div className="discover-view-switch">
        <Button variant="secondary" aria-pressed={view === "map"} onClick={() => setView(view === "map" ? "list" : "map")}>
          {view === "map" ? "List" : "Map"}
        </Button>
      </div>

      <div className={`discover-results discover-view-${view}`}>
        <section className="discover-list" aria-label="Restaurants" aria-busy={results.status === "loading"}>
          {results.status === "loading" && <Skeleton label="Finding restaurants" lines={6} />}
          {results.status === "error" && <ErrorState message={results.message} onRetry={search} />}
          {results.status === "ready" && (
            <>
              <p role="status" className="discover-count">
                {results.total === 0 ? "" : `${results.total} ${results.total === 1 ? "restaurant" : "restaurants"}`}
              </p>
              {results.items.length === 0 ? (
                <EmptyState title="No restaurants match. Try removing a filter." action={<Button onClick={clearFilters}>Clear filters</Button>} />
              ) : (
                <div className="discover-cards">
                  {results.items.map((card) => (
                    <RestaurantCard key={card.public_id} card={card} when={when} highlighted={highlighted === card.public_id} onHighlight={setHighlighted} />
                  ))}
                </div>
              )}
              {moreError && (
                <p role="alert" className="room-error">
                  {moreError}
                </p>
              )}
              {results.items.length < results.total && (
                <Button variant="secondary" busy={loadingMore} onClick={() => void showMore()}>
                  Show more
                </Button>
              )}
            </>
          )}
        </section>
        {showMap && (
          <div className="discover-map-column">
            <Suspense fallback={<Skeleton label="Loading the map" lines={4} />}>
              <ResultsMap pins={pins} highlightedId={highlighted} onSelect={selectPin} center={place} />
            </Suspense>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Chips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="discover-chips">
      <span className="discover-chips-label" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({ pressed, onClick, children, label }: { pressed: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" className={`discover-chip${pressed ? " is-on" : ""}`} aria-pressed={pressed} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}
