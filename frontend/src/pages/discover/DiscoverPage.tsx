// The home page (spec 9.1): search restaurants by name or cuisine, near me or in a city, with
// filters and an optional date, time and party, as a list with a map beside it (a List/Map
// switch on a phone). One sticky command bar holds the search and the quick controls; the
// secondary filters are in a drawer. Twenty results at a time, "Show more" for the rest.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchRestaurants } from "../../api/discovery";
import type { FeatureKey, RestaurantCard as Card, SearchQuery, SearchWhen } from "../../api/discovery";
import { Button, EmptyState, ErrorState, PageShell, Skeleton } from "../../design/components";
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
  const where = place?.label === "Lisboa" ? "Lisbon" : place?.label ?? "Anywhere";
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
  const [draft, setDraft] = useState({cuisines, prices, features, place, date, time, party, availableOnly});
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const openFilters = (): void => {setDraft({cuisines, prices, features, place, date, time, party, availableOnly});setDrawer(true);};
  const applyFilters = (): void => {
    setCuisines(draft.cuisines);setPrices(draft.prices);setFeatures(draft.features);
    setDate(draft.date);setTime(draft.time);setParty(draft.party);setAvailableOnly(draft.availableOnly);
    setPlace(draft.place);savePlace(draft.place);setDrawer(false);
  };
  useEffect(() => {
    if (!drawer) return;
    let current = true;
    setPreviewTotal(null);
    const delay = window.setTimeout(() => {
      const previewWhen = completeWhen(draft.date,draft.time,Number(draft.party));
      void searchRestaurants({q,cuisines:draft.cuisines,prices:draft.prices,features:draft.features,place:draft.place,when:previewWhen,availableOnly:draft.availableOnly&&previewWhen!==null,limit:20,offset:0}).then(answer=>{if(current)setPreviewTotal(answer.total);},()=>{if(current)setPreviewTotal(null);});
    },250);
    return () => {current=false;window.clearTimeout(delay);};
  },[drawer,draft,q]);
  const [allCuisines, setAllCuisines] = useState(false);
  const [view, setView] = useState<"list" | "map">(saved.view);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(saved.pinned ?? null);
  // True while the numbered diagram stands in for a map whose tiles failed.
  const [, setDiagram] = useState(false);
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

  const items = results.status === "ready" ? results.items : [];
  const pins = useMemo(
    () => items.map((c,index) => ({ id: c.public_id, name: c.name, lat: c.lat as number, lng: c.lng as number, number: index + 1 })).filter(pin => pin.lat !== null && pin.lng !== null),
    [items],
  );
  // The diagram numbers its pins in list order; cards wear the same numbers.
  const pinNumbers = useMemo(() => new Map(items.map((card, index) => [card.public_id, index + 1])), [items]);
  const selectPin = (id: string): void => {
    setPinned(id);
    const card = document.getElementById(`card-${id}`);
    if (wide) {
      card?.scrollIntoView?.({ block: "nearest", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      card?.querySelector<HTMLAnchorElement>("h3 a")?.focus({ preventScroll: true });
    } else window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("#discover-selected-result button")?.focus({preventScroll:true}));
  };
  const closePinSummary = (): void => {
    // A hidden Leaflet map remains mounted behind the fallback diagram.
    const pin = document.querySelector<HTMLElement>('.schematic-pin[aria-pressed="true"]') ?? document.querySelector<HTMLElement>(".discover-pin-selected");
    setPinned(null);
    window.requestAnimationFrame(() => pin?.focus({preventScroll:true}));
  };
  useEffect(() => {
    const persist = (): void => saveDiscoveryState({text,cuisines,prices,features,date,time,party,availableOnly,view,scroll:window.scrollY,pages:Math.max(1,Math.ceil(items.length/PAGE)),pinned});
    persist();
    window.addEventListener("scroll",persist,{passive:true});
    return () => window.removeEventListener("scroll",persist);
  }, [text,cuisines,prices,features,date,time,party,availableOnly,view,items.length,pinned]);
  useEffect(() => {
    if (results.status === "ready" && !restoredScroll.current) {
      restoredScroll.current = true;
      if (saved.scroll > 0) window.requestAnimationFrame(() => window.scrollTo(0,saved.scroll));
    }
  }, [results,saved.scroll]);
  const showMap = wide || view === "map";
  const selectedCard = items.find(card => card.public_id === pinned);
  return <div className={`discover-route${!wide && view === "map" ? " is-map-view" : ""}`}><PageShell title="Find a table you will love" width="wide" headerActions={<PublicHeaderActions />}>
    <section className={`discover-top${!wide && view === "map" ? " discover-top-compact" : ""}`} aria-labelledby="discover-heading">
      <h1 id="discover-heading" aria-label={wide?"Find a table you’ll love.":"Find your table."}><span className="discover-desktop-title">Find a table you’ll love.</span><span className="discover-mobile-title">Find your table.</span></h1><p>See the room and choose where you’ll sit.</p>
    </section>
    {!wide&&<button className="discover-summary" type="button" aria-label={`When and where: ${contextSummary(place,date,time,party)}`} aria-haspopup="dialog" aria-expanded={drawer} onClick={openFilters}>{contextSummary(place,date,time,party)} <span aria-hidden="true">⌄</span></button>}
    <DiscoverBar wide={wide} text={text} onText={setText} place={place} onPlace={choosePlace} locating={locating} onNearMe={nearMe} date={date} time={time} party={party} onDate={changeDate} onTime={setTime} onParty={setParty} onClearWhen={clearWhen} features={features} onFeatures={setFeatures} filterCount={filterCount} drawerOpen={drawer} onDrawer={openFilters}/>
    {locationNote&&<p role="status">{locationNote}</p>}
    <div className="discover-active" aria-label="Active filters">
      {cuisines.map(key=><button key={key} type="button" className="discover-chip" aria-label={`Remove ${cuisineLabel(key)}`} onClick={()=>setCuisines(cuisines.filter(c=>c!==key))}>{cuisineLabel(key)} ×</button>)}
      {prices.map(n=><button key={n} type="button" className="discover-chip" aria-label={`Remove price level ${n}`} onClick={()=>setPrices(prices.filter(p=>p!==n))}>{"€".repeat(n)} ×</button>)}
      {features.filter(key=>!wide||key==="accessible").map(key=><button key={key} type="button" className="discover-chip" aria-label={`Remove ${DISCOVERY_FEATURE_LABELS[key]}`} onClick={()=>setFeatures(features.filter(f=>f!==key))}>{DISCOVERY_FEATURE_LABELS[key]} ×</button>)}
    </div>
    {features.includes("sun")&&<p className="discover-filter-note">Sunlight at your booking time appears on the table map.</p>}
    <FilterDrawer open={drawer} onClose={()=>setDrawer(false)} onApply={applyFilters} cuisines={draft.cuisines} onCuisines={value=>setDraft({...draft,cuisines:value})} prices={draft.prices} onPrices={value=>setDraft({...draft,prices:value})} features={draft.features} onFeatures={value=>setDraft({...draft,features:value})} allCuisines={allCuisines} onAllCuisines={setAllCuisines} hasWhen={completeWhen(draft.date,draft.time,Number(draft.party))!==null} availableOnly={draft.availableOnly} onAvailableOnly={value=>setDraft({...draft,availableOnly:value})} onClear={()=>setDraft({...draft,cuisines:[],prices:[],features:[],availableOnly:true})} total={previewTotal} showQuick narrowExtras={<ContextControls variant="stacked" place={draft.place} onPlace={value=>setDraft({...draft,place:value})} date={draft.date} time={draft.time} party={draft.party} onDate={value=>setDraft({...draft,date:value,time:draft.time||(value?DEFAULT_TIME:"")})} onTime={value=>setDraft({...draft,time:value})} onParty={value=>setDraft({...draft,party:value})} onClearWhen={()=>setDraft({...draft,date:"",time:""})}/>}/>
    <div className="discover-results-head"><h2>{text?"Search results":results.status==="ready"?`${results.total} ${results.total===1?"restaurant":"restaurants"}${place?` near ${place.label==="Lisboa"?"Lisbon":place.label}`:""}`:"Finding restaurants"}</h2>
      {(features.length+cuisines.length+prices.length)>0&&<button type="button" className="discover-more" onClick={()=>{setCuisines([]);setPrices([]);setFeatures([]);}}>Clear filters</button>}
      <div className="discover-view-switch" role="group" aria-label="Results view"><Button variant={view==="list"?"primary":"secondary"} aria-pressed={view==="list"} onClick={()=>setView("list")}>List</Button><Button variant={view==="map"?"primary":"secondary"} aria-pressed={view==="map"} onClick={()=>setView("map")}>Map</Button></div>
      {wide&&when&&<p>Around {when.time} · Select a time to book</p>}
    </div>
    {place?.label==="Near me"&&<p role="status" className="discover-sort-note">Sorted by distance from where you are.</p>}
    <div className={`discover-results discover-view-${view}${results.status==="ready"&&!items.length?" is-empty":""}`}>
      <section className="discover-list" aria-label="Restaurants" aria-busy={results.status==="loading"||updating}>
        {updating&&<p role="status">{when?"Updating availability…":"Updating restaurants…"}</p>}
        {results.status==="loading"&&<Skeleton label="Finding restaurants" lines={6}/>}
        {results.status==="error"&&<ErrorState message={results.message} onRetry={search}/>}
        {results.status==="ready"&&<>
          {!items.length?<EmptyState title={text?`No restaurants match “${text}”`:when?"Nothing available near this time":"No restaurants match"} action={<><Button onClick={()=>{if(text){setText("");setQ("");}else openFilters();}}>{text?"Clear search term":when?"Change time":"Edit filters"}</Button>{text&&<Button variant="secondary" onClick={openFilters}>Edit filters</Button>}</>}><p>{text?"Try a different name or clear the search term.":when?"Try another time or adjust the availability filter.":"Try another cuisine or room feature."}</p></EmptyState>:<div className="discover-cards">{items.map(card=><RestaurantCard key={card.public_id} card={card} when={results.when} navigationWhen={when} pending={updating} priorityFeatures={features} selected={pinned===card.public_id} highlighted={highlighted===card.public_id} onHighlight={setHighlighted} number={pinNumbers.get(card.public_id)}/>)}</div>}
          {moreError&&<p role="alert">{moreError}</p>}
          {items.length<results.total&&<Button variant="secondary" busy={loadingMore} disabled={updating} onClick={()=>void showMore()}>Show more</Button>}
        </>}
      </section>
      {showMap&&<div className="discover-map-column"><Suspense fallback={<Skeleton label="Loading the map" lines={4}/>}><ResultsMap pins={pins} highlightedId={highlighted} selectedId={pinned} onSelect={selectPin} center={place} onFallback={setDiagram}/></Suspense>
        {!wide&&selectedCard&&<div id="discover-selected-result" className="discover-pin-summary" aria-live="polite"><RestaurantCard card={selectedCard} when={updating?null:when} navigationWhen={when} pending={updating} highlighted={false} selected onHighlight={()=>{}} number={pinNumbers.get(selectedCard.public_id)} compact/><button type="button" className="discover-map-close" aria-label="Close summary" onClick={closePinSummary}>×</button></div>}
      </div>}
    </div>
  </PageShell></div>;
}
