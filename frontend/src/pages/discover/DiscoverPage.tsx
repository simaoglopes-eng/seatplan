// The home page (spec 9.1): search restaurants by name or cuisine, near me or in a city, with
// filters and an optional date, time and party, as a list with a map beside it (a List/Map
// switch on a phone). One sticky command bar holds the search and the quick controls; the
// secondary filters are in a drawer. Twenty results at a time, "Show more" for the rest.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchRestaurants } from "../../api/discovery";
import type { FeatureKey, RestaurantCard as Card, SearchQuery } from "../../api/discovery";
import { Button, EmptyState, ErrorState, PageShell, Skeleton } from "../../design/components";
import { errorMessage } from "../restaurant/format";
import { ContextControls } from "./ContextControls";
import { DiscoverBar } from "./DiscoverBar";
import { FilterDrawer, QUICK_FEATURES } from "./FilterDrawer";
import { PublicHeaderActions } from "./PublicHeaderActions";
import { RestaurantCard } from "./RestaurantCard";
import { completeWhen, loadPlace, savePlace } from "./discoverModel";
import type { Place } from "./discoverModel";
import "./discover.css";

const ResultsMap = lazy(() => import("../../maps/ResultsMap"));
const PAGE = 20;
const DEFAULT_TIME = "20:00";

type Results = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: Card[]; total: number };

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
  if (!date) return `${where} · Any date`;
  const [year, month, day] = date.split("-").map(Number);
  const when = new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${where} · ${when}, ${time} · ${party === "1" ? "1 person" : `${party} people`}`;
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
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [party, setParty] = useState("2");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [allCuisines, setAllCuisines] = useState(false);
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

  const when = completeWhen(date, time, Number(party));
  const query: SearchQuery = useMemo(
    () => ({ q, cuisines, prices, features, place: place ? { lat: place.lat, lng: place.lng } : null, when, availableOnly: availableOnly && when !== null, limit: PAGE, offset: 0 }),
    // `when` is rebuilt every render, so depend on its parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, cuisines, prices, features, place, date, time, party, availableOnly],
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
        <button type="button" className="discover-summary" onClick={() => setDrawer(true)}>
          {contextSummary(place, date, time, party)}
        </button>
      )}
      {locationNote && <p role="status">{locationNote}</p>}
      {place?.label === "Near me" && (
        <p role="status" className="discover-near">
          Sorted by distance from where you are.{" "}
          <Button variant="ghost" onClick={() => choosePlace(null)}>
            Stop using my location
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
        total={results.status === "ready" ? results.total : null}
        showQuick={!wide}
        narrowExtras={
          wide ? null : (
            <>
              <ContextControls variant="stacked" place={place} onPlace={choosePlace} date={date} time={time} party={party} onDate={changeDate} onTime={setTime} onParty={setParty} onClearWhen={clearWhen} />
              <Button variant="secondary" busy={locating} onClick={nearMe}>
                Near me
              </Button>
            </>
          )
        }
      />

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
                {anyFilter && results.total > 0 && (
                  <button type="button" className="discover-more" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
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
