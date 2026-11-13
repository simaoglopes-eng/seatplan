// The one command bar of the discovery page: search, where and when, the quick filters and the
// drawer button, in a single sticky row (56 px) so the results get the screen. On a phone the
// bar keeps only the search box and the Filters button; the rest moves into the drawer.
import type { FeatureKey } from "../../api/discovery";
import { Button } from "../../design/components";
import { Chip, toggle } from "./Chips";
import { ContextControls } from "./ContextControls";
import type { Place } from "./discoverModel";
import { FEATURE_LABELS } from "./discoverModel";
import { QUICK_FEATURES } from "./FilterDrawer";

interface Props {
  wide: boolean;
  text: string;
  onText: (value: string) => void;
  place: Place | null;
  onPlace: (place: Place | null) => void;
  locating: boolean;
  onNearMe: () => void;
  date: string;
  time: string;
  party: string;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  onParty: (value: string) => void;
  onClearWhen: () => void;
  features: FeatureKey[];
  onFeatures: (value: FeatureKey[]) => void;
  filterCount: number;
  drawerOpen: boolean;
  onDrawer: () => void;
}

export function DiscoverBar(props: Props) {
  return (
    <form className="discover-bar" role="search" onSubmit={(event) => event.preventDefault()}>
      <input
        type="search"
        className="discover-bar-search"
        aria-label="Restaurant or cuisine"
        placeholder="Restaurant or cuisine"
        value={props.text}
        maxLength={80}
        autoComplete="off"
        onChange={(event) => props.onText(event.target.value)}
      />
      {props.wide && (
        <>
          <ContextControls
            variant="capsule"
            place={props.place}
            onPlace={props.onPlace}
            date={props.date}
            time={props.time}
            party={props.party}
            onDate={props.onDate}
            onTime={props.onTime}
            onParty={props.onParty}
            onClearWhen={props.onClearWhen}
          />
          <Button variant="secondary" busy={props.locating} onClick={props.onNearMe}>
            Near me
          </Button>
          <div className="discover-quick" role="group" aria-label="Quick filters">
            {QUICK_FEATURES.map((key) => (
              <Chip key={key} pressed={props.features.includes(key)} onClick={() => props.onFeatures(toggle(props.features, key))}>
                {FEATURE_LABELS[key]}
              </Chip>
            ))}
          </div>
        </>
      )}
      <Button variant="secondary" aria-haspopup="dialog" aria-expanded={props.drawerOpen} onClick={props.onDrawer}>
        Filters{props.filterCount > 0 ? ` (${props.filterCount})` : ""}
      </Button>
    </form>
  );
}
