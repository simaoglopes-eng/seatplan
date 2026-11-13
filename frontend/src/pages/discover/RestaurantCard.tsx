// One search result: cover photo, name, cuisines, price, distance, features in
// words, and (when the diner said when) up to three free times that open the
// restaurant page with the date, time and party already chosen.
import { Link } from "react-router-dom";
import type { RestaurantCard as Card, SearchWhen } from "../../api/discovery";
import { cuisineLabel, featureNames, formatDistance, priceText, restaurantHref } from "./discoverModel";

interface Props {
  card: Card;
  when: SearchWhen | null;
  highlighted: boolean;
  onHighlight: (id: string | null) => void;
}

export function RestaurantCard({ card, when, highlighted, onHighlight }: Props) {
  const distance = formatDistance(card.distance_m);
  const names = featureNames(card.features);
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
        {card.cover_url ? <img src={card.cover_url} alt={card.cover_alt ?? ""} loading="lazy" width={640} height={360} /> : <span className="discover-card-nophoto">No photo yet</span>}
      </Link>
      <div className="discover-card-body">
        <h3 id={`name-${card.public_id}`}>
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
        {names.length > 0 && (
          <ul className="discover-features" aria-label="Features">
            {names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
        {when && (
          <div className="discover-times">
            {card.next_times.length > 0 ? (
              <>
                <span className="discover-times-label">Free for {when.party}:</span>
                {card.next_times.map((time) => (
                  <Link key={time} className="btn btn-secondary discover-time" to={restaurantHref(card, when, time)}>
                    {time}
                  </Link>
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
