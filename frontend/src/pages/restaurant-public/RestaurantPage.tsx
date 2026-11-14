// Route /restaurants/:slug: the public page of a restaurant (spec 9.2) with the
// booking flow embedded under "Book a table". A link from the discovery page
// brings ?date=&time=&party=, and the booking flow starts with them filled in.
// The owner sees an unpublished restaurant with a Preview banner; nobody else can.
import { lazy, Suspense, useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { getPublicRestaurant } from "../../api/discovery";
import type { PublicRestaurant } from "../../api/discovery";
import { EmptyState, ErrorState, PageShell, Skeleton } from "../../design/components";
import { PublicHeaderActions } from "../discover/PublicHeaderActions";
import { FEATURE_KEYS, FEATURE_LABELS, cuisineLabel, formatDistance, loadPlace, priceText } from "../discover/discoverModel";
import { BookingEmbed } from "../restaurant/BookingPage";
import { errorMessage } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { Gallery } from "./Gallery";
import { instagramHref, metersBetween, shortDate, telHref, websiteHref } from "./pageModel";
import { weeklyRows } from "./scheduleText";
import "../restaurant/restaurant.css";
import "./restaurantPage.css";

const ResultsMap = lazy(() => import("../../maps/ResultsMap"));

export default function RestaurantPage() {
  const { slug = "" } = useParams();
  const { state, reload } = useLoad(() => getPublicRestaurant(slug), slug);
  const title = state.status === "ready" ? state.data.name : "Restaurant";
  return (
    <PageShell title={title} width="wide" headerActions={<PublicHeaderActions />}>
      {state.status === "loading" && <Skeleton lines={6} label="Loading the restaurant" />}
      {state.status === "error" && <LoadError error={state.error} onRetry={() => reload()} />}
      {state.status === "ready" && <Page data={state.data} />}
    </PageShell>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.code === "not_found") {
    return (
      <EmptyState title="We cannot find this restaurant" action={<Link to="/">Find another restaurant</Link>}>
        <p>It may have been unpublished, or the address may be mistyped.</p>
      </EmptyState>
    );
  }
  return <ErrorState title="We could not open this restaurant" message={errorMessage(error)} onRetry={onRetry} />;
}

function Page({ data }: { data: PublicRestaurant }) {
  const { search } = useLocation();
  const book = useRef<HTMLElement>(null);
  const linked = new URLSearchParams(search).has("date");
  // Coming from a search with a time chosen: take the diner to the booking.
  useEffect(() => {
    if (linked && !data.preview) book.current?.scrollIntoView?.({ block: "start" });
  }, [linked, data.preview]);

  // The button moves keyboard focus with the page, so the next Tab lands in the booking, not back at the top.
  const goToBooking = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    book.current?.scrollIntoView?.({ block: "start" });
    book.current?.querySelector<HTMLElement>("select, input, button")?.focus({ preventScroll: true });
  };

  const place = loadPlace();
  const meters = place && data.lat !== null && data.lng !== null ? metersBetween(place, { lat: data.lat, lng: data.lng }) : null;
  const price = priceText(data.price_level);
  const rows = weeklyRows(data.schedule.service_periods);
  const closed = data.schedule.blackout_dates;
  const highlights = FEATURE_KEYS.filter((key) => data.features[key]).map((key) => FEATURE_LABELS[key]);
  const tel = telHref(data.phone);
  const site = websiteHref(data.website);
  const instagram = instagramHref(data.instagram);

  return (
    <article className="rp">
      {data.preview && (
        <p role="status" className="rp-preview">
          Preview: this restaurant is not published yet. Only you can see this page.
        </p>
      )}
      <header className="rp-head">
        <div className="rp-head-main">
          <h1>{data.name}</h1>
          <p className="rp-line">
            {data.cuisines.map(cuisineLabel).join(", ")}
            {price && (
              <>
                {" · "}
                <span aria-hidden="true">{price}</span>
                <span className="visually-hidden">Price level {data.price_level} of 4</span>
              </>
            )}
            {meters !== null && ` · ${formatDistance(meters)} from you`}
          </p>
          {data.address && <p className="rp-line">{data.address}</p>}
          {highlights.length > 0 && (
            <ul className="discover-features" aria-label="Highlights">
              {highlights.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
        </div>
        {!data.preview && (
          <a className="btn btn-primary rp-cta" href="#book" onClick={goToBooking}>
            Book a table
          </a>
        )}
      </header>
      <Gallery photos={data.photos} name={data.name} preview={data.preview} />

      {/* The booking comes right after the identity: nothing has to be scrolled past to reserve. */}
      <section ref={book} id="book" className="rp-book" aria-labelledby="rp-book-title">
        <h2 id="rp-book-title">Book a table</h2>
        {data.preview ? (
          <p className="rb-muted">Booking opens as soon as you publish {data.name}.</p>
        ) : (
          <div className="rb-page">
            <BookingEmbed venueId={data.public_id} />
          </div>
        )}
      </section>

      <div className="rp-columns">
        <div>
          {data.description && (
            <section aria-labelledby="rp-about">
              <h2 id="rp-about">About</h2>
              <p>{data.description}</p>
            </section>
          )}
          <section aria-labelledby="rp-hours">
            <h2 id="rp-hours">Hours</h2>
            {rows.length === 0 ? (
              <p className="rb-muted">Opening hours are not published yet.</p>
            ) : (
              <table className="rp-hours">
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.days}>
                      <th scope="row">{row.days}</th>
                      <td>{row.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {closed.length > 0 && (
              <ul className="rp-closed" aria-label="Days closed">
                {closed.slice(0, 6).map((day) => (
                  <li key={day.date}>
                    Closed {shortDate(day.date)}
                    {day.reason ? `: ${day.reason}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside aria-label="Where and how to reach us">
          <h2>Find us</h2>
          {data.lat !== null && data.lng !== null && (
            <div className="rp-map">
              <Suspense fallback={<Skeleton label="Loading the map" lines={3} />}>
                <ResultsMap pins={[{ id: data.public_id, name: data.name, lat: data.lat, lng: data.lng }]} highlightedId={data.public_id} onSelect={() => undefined} />
              </Suspense>
            </div>
          )}
          <p>
            <a href={data.maps_url} target="_blank" rel="noopener noreferrer">
              Open in Google Maps<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </p>
          <ul className="rp-contact">
            {tel && (
              <li>
                <a href={tel}>{data.phone}</a>
              </li>
            )}
            {site && (
              <li>
                <a href={site} target="_blank" rel="noopener noreferrer">
                  Website<span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            )}
            {instagram && (
              <li>
                <a href={instagram} target="_blank" rel="noopener noreferrer">
                  Instagram<span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            )}
          </ul>
        </aside>
      </div>
    </article>
  );
}
