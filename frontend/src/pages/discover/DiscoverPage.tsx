// The home page (spec 9.1): search restaurants by name or cuisine, near me or in a city, with
// filters and an optional date, time and party, as a list with a map beside it (a List/Map
// switch on a phone). One sticky command bar holds the search and the quick controls; the
// secondary filters are in a drawer. Twenty results at a time, "Show more" for the rest.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchRestaurants } from "../../api/discovery";
import type { FeatureKey, RestaurantCard as Card, SearchQuery, SearchWhen } from "../../api/discovery";
import { Button, Dialog, EmptyState, ErrorState, PageShell, Skeleton } from "../../design/components";
import { errorMessage } from "../restaurant/format";
import { ContextControls } from "./ContextControls";
import { DiscoverBar } from "./DiscoverBar";
import { FilterDrawer, QUICK_FEATURES } from "./FilterDrawer";
import { PublicHeaderActions } from "./PublicHeaderActions";
import { RestaurantCard } from "./RestaurantCard";
import { completeWhen, cuisineLabel, DISCOVERY_FEATURE_LABELS, loadPlace, savePlace } from "./discoverModel";
import type { Place } from "./discoverModel";
import { loadDiscoveryState, saveDiscoveryState } from "./discoveryState";
import "./discover.css";

const ResultsMap = lazy(() => import("../../maps/ResultsMap"));
const PAGE = 20;
const DEFAULT_TIME = "20:00";

type Results = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: Card[]; total: number; key: string; when: SearchWhen | null };

function useWide(): boolean {
  const query = "(min-width: 64rem)";
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

/** "Lisboa · 20 Nov, 20:00 · 2 people": the context on a phone, where the controls are in the drawer. */
function contextSummary(place: Place | null, date: string, time: string, party: string): string {
  const where = place?.label ?? "Anywhere";
  if (!date) return `${where} · Any date · ${party === "1" ? "1 person" : `${party} people`}`;
  const [year, month, day] = date.split("-").map(Number);
  const when = new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${where} · ${when}, ${time} · ${party === "1" ? "1 person" : `${party} people`}`;
}

export default function DiscoverPage() {
  const [saved] = useState(loadDiscoveryState);
  const [text, setText] = useState(saved.text);
  const [q, setQ] = useState(saved.text);
  const [cuisines, setCuisines] = useState<string[]>(saved.cuisines);
  const [prices, setPrices] = useState<number[]>(saved.prices);
  const [features, setFeatures] = useState<FeatureKey[]>(saved.features);
  const [place, setPlace] = useState<Place | null>(loadPlace);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");
  const [date, setDate] = useState(saved.date);
  const [time, setTime] = useState(saved.time);
  const [party, setParty] = useState(saved.party);
  const [availableOnly, setAvailableOnly] = useState(saved.availableOnly);
  const [drawer, setDrawer] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [allCuisines, setAllCuisines] = useState(false);
  const [view, setView] = useState<"list" | "map">(saved.view);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  // True while the numbered diagram stands in for a map whose tiles failed.
  const [diagram, setDiagram] = useState(false);
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

  const when = completeWhen(date, time, Number(party));
  const query: SearchQuery = useMemo(
    () => ({ q, cuisines, prices, features, place: place ? { lat: place.lat, lng: place.lng } : null, when, availableOnly: availableOnly && when !== null, limit: PAGE, offset: 0 }),
    // `when` is rebuilt every render, so depend on its parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, cuisines, prices, features, place, date, time, party, availableOnly],
  );
  const queryKey = JSON.stringify(query);
  const originalQuery = useRef(queryKey);
  const restoredScroll = useRef(false);

  const search = useCallback((): void => {
    const id = ++request.current;
    setResults((now) => (now.status === "ready" ? now : { status: "loading" }));
    setMoreError("");
    const load = async () => {
      const answer = await searchRestaurants(query);
      const pages = queryKey === originalQuery.current ? saved.pages : 1;
      while (id === request.current && answer.items.length < answer.total && answer.items.length < pages * PAGE) {
        const next = await searchRestaurants({ ...query, offset: answer.items.length });
        if (!next.items.length) break;
        answer.items.push(...next.items);
        answer.total = next.total;
      }
      return answer;
    };
    void load().then(
      (answer) => id === request.current && setResults({ status: "ready", items: answer.items, total: answer.total, key: queryKey, when }),
      (error: unknown) => id === request.current && setResults({ status: "error", message: errorMessage(error, "We could not load the restaurants. Please try again.") }),
    );
    // The key stands for the whole query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);
  useEffect(search, [search]);
  const updating = results.status === "ready" && (results.key !== queryKey || text !== q);

  const showMore = async (): Promise<void> => {
    if (results.status !== "ready" || updating || loadingMore) return;
    const id = ++request.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const answer = await searchRestaurants({ ...query, offset: results.items.length });
      if (id === request.current) setResults({ ...results, items: [...results.items, ...answer.items], total: answer.total });
    } catch (error) {
      if (id === request.current) setMoreError(errorMessage(error, "We could not load more. Please try again."));
    } finally {
      setLoadingMore(false);
    }
  };

  const choosePlace = (next: Place | null): void => {
    setPlace(next);
    savePlace(next);
    setLocationNote("");
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

  // Picking a date is enough to ask "what is free": the time starts at dinner, ready to change.
  const changeDate = (value: string): void => {
    setDate(value);
    if (value && !time) setTime(DEFAULT_TIME);
  };
  const clearWhen = (): void => {
    setDate("");
    setTime("");
  };

  const quickCount = features.filter((f) => QUICK_FEATURES.includes(f)).length;
  // On a wide screen the quick filters sit in the bar, so the button counts only what is inside the drawer.
  const filterCount = cuisines.length + prices.length + (features.includes("accessible") ? 1 : 0) + (wide ? 0 : quickCount);
  const anyFilter = filterCount > 0 || quickCount > 0 || text !== "";
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
  // The diagram numbers its pins in list order; cards wear the same numbers.
  const pinNumbers = useMemo(() => new Map(pins.map((pin, index) => [pin.id, index + 1])), [pins]);
  const selectPin = (id: string): void => {
    setPinned(id);
    const card = document.getElementById(`card-${id}`);
    if (wide) {
      card?.scrollIntoView?.({ block: "nearest", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      card?.querySelector<HTMLAnchorElement>("h3 a")?.focus({ preventScroll: true });
    }
  };
  useEffect(() => {
    const persist = (): void => saveDiscoveryState({text,cuisines,prices,features,date,time,party,availableOnly,view,scroll:window.scrollY,pages:Math.max(1,Math.ceil(items.length/PAGE))});
    persist();
    window.addEventListener("scroll",persist,{passive:true});
    return () => window.removeEventListener("scroll",persist);
  }, [text,cuisines,prices,features,date,time,party,availableOnly,view,items.length]);
  useEffect(() => {
    if (results.status === "ready" && !restoredScroll.current) {
      restoredScroll.current = true;
      if (saved.scroll > 0) window.requestAnimationFrame(() => window.scrollTo(0,saved.scroll));
    }
  }, [results,saved.scroll]);
  const showMap = wide || view === "map";
  const selectedCard = items.find(card => card.public_id === pinned);

  return (
    <PageShell title="Find a table you will love" width="wide" headerActions={<PublicHeaderActions />}>
      <section className="discover-top" aria-labelledby="discover-heading">
        <h1 id="discover-heading">Find a table you will love</h1>
        <p className="discover-lede">See the room, the light and the view before you book.</p>
      </section>

      <DiscoverBar
        wide={wide}
        text={text}
        onText={setText}
        place={place}
        onPlace={choosePlace}
        locating={locating}
        onNearMe={nearMe}
        date={date}
        time={time}
        party={party}
        onDate={changeDate}
        onTime={setTime}
        onParty={setParty}
        onClearWhen={clearWhen}
        features={features}
        onFeatures={setFeatures}
        filterCount={filterCount}
        drawerOpen={drawer}
        onDrawer={() => setDrawer(true)}
      />
      {!wide && (
        <button type="button" className="discover-summary" aria-haspopup="dialog" aria-expanded={contextOpen} onClick={() => setContextOpen(true)}>
          <strong>When and where</strong><span>{contextSummary(place, date, time, party)}</span>
        </button>
      )}
      {locationNote && <p role="status">{locationNote}</p>}
      {place && (
        <p role="status" className="discover-near">
          {place.label === "Near me" ? "Sorted by distance from where you are." : `Sorted by distance from central ${place.label === "Lisboa" ? "Lisbon" : place.label}.`}{" "}
          <Button variant="ghost" onClick={() => choosePlace(null)}>
            {place.label === "Near me" ? "Stop using my location" : "Clear city"}
          </Button>
        </p>
      )}

      <FilterDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        cuisines={cuisines}
        onCuisines={setCuisines}
        prices={prices}
        onPrices={setPrices}
        features={features}
        onFeatures={setFeatures}
        allCuisines={allCuisines}
        onAllCuisines={setAllCuisines}
        hasWhen={when !== null}
        availableOnly={availableOnly}
        onAvailableOnly={setAvailableOnly}
        onClear={clearFilters}
        total={results.status === "ready" && !updating ? results.total : null}
        showQuick={!wide}
      />
      <Dialog open={contextOpen} title="When and where" onClose={() => setContextOpen(false)} actions={<Button onClick={() => setContextOpen(false)}>Show restaurants</Button>}>
        <ContextControls variant="stacked" place={place} onPlace={choosePlace} date={date} time={time} party={party} onDate={changeDate} onTime={setTime} onParty={setParty} onClearWhen={clearWhen} />
        <Button variant="secondary" busy={locating} onClick={nearMe}>Near me</Button>
        {locationNote && <p role="status">{locationNote}</p>}
      </Dialog>

      <div className="discover-active" aria-label="Active filters">
        {cuisines.map(key => <button key={key} type="button" className="discover-chip" aria-label={`Remove ${cuisineLabel(key)}`} onClick={() => setCuisines(cuisines.filter(c => c !== key))}>{cuisineLabel(key)} ×</button>)}
        {prices.map(level => <button key={level} type="button" className="discover-chip" aria-label={`Remove price level ${level}`} onClick={() => setPrices(prices.filter(p => p !== level))}>{"€".repeat(level)} ×</button>)}
        {features.filter(key => !wide || key === "accessible").map(key => <button key={key} type="button" className="discover-chip" aria-label={`Remove ${DISCOVERY_FEATURE_LABELS[key]}`} onClick={() => setFeatures(features.filter(f => f !== key))}>{DISCOVERY_FEATURE_LABELS[key]} ×</button>)}
      </div>

      <div className="discover-view-switch" role="group" aria-label="Results view">
        <Button variant={view === "list" ? "primary" : "secondary"} aria-pressed={view === "list"} onClick={() => setView("list")}>List</Button>
        <Button variant={view === "map" ? "primary" : "secondary"} aria-pressed={view === "map"} onClick={() => setView("map")}>Map</Button>
      </div>

      <div className={`discover-results discover-view-${view}`}>
        <section className="discover-list" aria-label="Restaurants" aria-busy={results.status === "loading" || updating}>
          {updating && <p role="status">{when ? "Updating availability…" : "Updating restaurants…"}</p>}
          {results.status === "loading" && <Skeleton label="Finding restaurants" lines={6} />}
          {results.status === "error" && <ErrorState message={results.message} onRetry={search} />}
          {results.status === "ready" && (
            <>
              <p role="status" className="discover-count">
                {results.total === 0 ? "" : `${results.total} ${results.total === 1 ? "restaurant" : "restaurants"}`}
                {anyFilter && results.total > 0 && (
                  <button type="button" className="discover-more" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </p>
              {results.items.length === 0 ? (
                <EmptyState title={text ? "No restaurants match your search" : when ? "Nothing available near this time" : "No restaurants match"} action={text ? <Button onClick={() => { setText(""); setQ(""); }}>Clear search</Button> : anyFilter ? <Button onClick={clearFilters}>Clear filters</Button> : when ? <Button onClick={() => { if (!wide) setContextOpen(true); else document.querySelector<HTMLInputElement>('[aria-label="Time"]')?.focus(); }}>Try a nearby time</Button> : undefined}>
                  <p>{text ? "Try another restaurant name or cuisine. Your date and party will stay as they are." : when ? "Try another time or turn off the availability filter." : "Choose another setting or city to broaden your search."}</p>
                </EmptyState>
              ) : (
                <div className="discover-cards">
                  {results.items.map((card) => (
                    <RestaurantCard key={card.public_id} card={card} when={results.when} pending={updating} priorityFeatures={features} highlighted={(highlighted ?? pinned) === card.public_id} onHighlight={setHighlighted} number={diagram ? pinNumbers.get(card.public_id) : undefined} />
                  ))}
                </div>
              )}
              {moreError && (
                <p role="alert" className="room-error">
                  {moreError}
                </p>
              )}
              {results.items.length < results.total && (
                <Button variant="secondary" busy={loadingMore} disabled={updating} onClick={() => void showMore()}>
                  Show more
                </Button>
              )}
            </>
          )}
        </section>
        {showMap && items.length > 0 && (
          <div className="discover-map-column">
            <Suspense fallback={<Skeleton label="Loading the map" lines={4} />}>
              <ResultsMap pins={pins} highlightedId={highlighted ?? pinned} onSelect={selectPin} center={place} onFallback={setDiagram} />
            </Suspense>
            {!wide && selectedCard && <div className="discover-pin-summary" aria-live="polite"><strong>{selectedCard.name}</strong><p>{selectedCard.cuisines.map(cuisineLabel).join(", ")}</p><a className="btn btn-primary" href={`/restaurants/${encodeURIComponent(selectedCard.slug)}`}>View restaurant</a><Button variant="ghost" onClick={() => setPinned(null)}>Close summary</Button></div>}
          </div>
        )}
      </div>
    </PageShell>
  );
}
