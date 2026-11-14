// One search result, with four things and no more: the photo, who it is (name, cuisines, price,
// distance), one line about the room (sunny tables, a view, a terrace: facts the restaurant
// already has, nothing worked out per search), and, when the diner said when, up to three free
// times that open the restaurant page with the date, time and party already chosen.
import { Link } from "react-router-dom";
import { useState } from "react";
import type { FeatureKey, RestaurantCard as Card, SearchWhen } from "../../api/discovery";
import { DISCOVERY_FEATURE_LABELS, cuisineLabel, formatDistance, priceText, restaurantHref } from "./discoverModel";

interface Props {
  card: Card;
  when: SearchWhen | null;
  highlighted: boolean;
  onHighlight: (id: string | null) => void;
  /** The pin number on the diagram that replaces the map when tiles fail; the card wears the same number. */
  number?: number;
  pending?: boolean;
  priorityFeatures?: FeatureKey[];
}

export function RestaurantCard({ card, when, highlighted, onHighlight, number, pending = false, priorityFeatures = [] }: Props) {
  const [failedPhoto, setFailedPhoto] = useState(false);
  const distance = formatDistance(card.distance_m);
  const featureOrder: FeatureKey[] = [...new Set([...priorityFeatures, "sun", "view", "terrace"] as FeatureKey[])];
  const room = featureOrder.filter(key => card.features[key]).map(key => DISCOVERY_FEATURE_LABELS[key]).join(" · ");
  const price = priceText(card.price_level);
  return (
    <article
      className={`discover-card${highlighted ? " is-highlighted" : ""}`}
      id={`card-${card.public_id}`}
      aria-labelledby={`name-${card.public_id}`}
      onMouseEnter={() => onHighlight(card.public_id)}
      onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(card.public_id)}
      onBlur={() => onHighlight(null)}
    >
      <Link to={restaurantHref(card, when)} className="discover-card-photo" tabIndex={-1} aria-hidden="true">
        {number !== undefined && (
          <span className="discover-card-number" aria-hidden="true">
            {number}
          </span>
        )}
        {card.cover_url && !failedPhoto ? <img src={card.cover_url} onError={() => setFailedPhoto(true)} alt={card.cover_alt ?? ""} loading="lazy" width={640} height={400} /> : <span className="discover-card-nophoto">Photo unavailable</span>}
      </Link>
      <div className="discover-card-body">
        <h3 id={`name-${card.public_id}`}>
          {number !== undefined && <span className="visually-hidden">{number}. </span>}
          <Link to={restaurantHref(card, when)}>{card.name}</Link>
        </h3>
        {card.cover_url && card.cover_alt && <p className="visually-hidden">Photo: {card.cover_alt}</p>}
        <p className="discover-card-line">
          {card.cuisines.map(cuisineLabel).join(", ")}
          {price && (
            <>
              {" · "}
              <span aria-hidden="true">{price}</span>
              <span className="visually-hidden">Price level {card.price_level} of 4</span>
            </>
          )}
          {distance && ` · ${distance}`}
        </p>
        {room && <p className="discover-ambience">{room}</p>}
        {when && (
          <div className="discover-times">
            {card.next_times.length > 0 ? (
              <>
                <span className="discover-times-label">Available near {when.time} · {when.party} {when.party === 1 ? "person" : "people"}</span>
                {card.next_times.map((time) => (
                  pending ? <button key={time} type="button" className="btn btn-secondary discover-time" disabled>{time}</button> :
                  <Link key={time} className="btn btn-secondary discover-time" to={restaurantHref(card, when, time)}>{time}</Link>
                ))}
              </>
            ) : (
              <span className="discover-times-label">No free table near {when.time}.</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
