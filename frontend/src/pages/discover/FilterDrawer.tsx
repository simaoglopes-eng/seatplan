// The filters that do not fit in the command bar, in a drawer from the right: cuisine, price,
// wheelchair access and "available at that time". On a phone the drawer also holds where and
// when and the three quick filters, so the bar can stay one line high.
import type { ReactNode } from "react";
import type { FeatureKey } from "../../api/discovery";
import { CUISINES } from "../../api/owner";
import { Button, Dialog } from "../../design/components";
import { Chip, Chips, toggle } from "./Chips";
import { cuisineLabel, DISCOVERY_FEATURE_LABELS as FEATURE_LABELS } from "./discoverModel";

export const QUICK_FEATURES: FeatureKey[] = ["sun", "view", "terrace"];
const FIRST_CUISINES = 8;

interface Props {
  open: boolean;
  onClose: () => void;
  cuisines: string[];
  onCuisines: (value: string[]) => void;
  prices: number[];
  onPrices: (value: number[]) => void;
  features: FeatureKey[];
  onFeatures: (value: FeatureKey[]) => void;
  allCuisines: boolean;
  onAllCuisines: (value: boolean) => void;
  /** Whether a date and time are set, which is what makes "available at that time" meaningful. */
  hasWhen: boolean;
  availableOnly: boolean;
  onAvailableOnly: (value: boolean) => void;
  onClear: () => void;
  total: number | null;
  /** Controls that live in the bar on a wide screen and in the drawer on a phone. */
  narrowExtras?: ReactNode;
  showQuick: boolean;
}

export function FilterDrawer(props: Props) {
  const { cuisines, prices, features } = props;
  const done = props.total === null ? "Done" : `Show ${props.total} ${props.total === 1 ? "restaurant" : "restaurants"}`;
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Filters"
      placement="side"
      actions={
        <>
          <Button variant="secondary" onClick={props.onClear}>
            Clear filters
          </Button>
          <Button onClick={props.onClose}>{done}</Button>
        </>
      }
    >
      <div className="discover-drawer">
        {props.narrowExtras}
        {props.showQuick && (
          <Chips label="Quick filters">
            {QUICK_FEATURES.map((key) => (
              <Chip key={key} pressed={features.includes(key)} onClick={() => props.onFeatures(toggle(features, key))}>
                {FEATURE_LABELS[key]}
              </Chip>
            ))}
          </Chips>
        )}
        <Chips label="Cuisine">
          {CUISINES.filter((key, index) => props.allCuisines || index < FIRST_CUISINES || cuisines.includes(key)).map((key) => (
            <Chip key={key} pressed={cuisines.includes(key)} onClick={() => props.onCuisines(toggle(cuisines, key))}>
              {cuisineLabel(key)}
            </Chip>
          ))}
          <button type="button" className="discover-more" aria-expanded={props.allCuisines} onClick={() => props.onAllCuisines(!props.allCuisines)}>
            {props.allCuisines ? "Fewer cuisines" : "More cuisines"}
          </button>
        </Chips>
        <Chips label="Price">
          {[1, 2, 3, 4].map((level) => (
            <Chip key={level} pressed={prices.includes(level)} label={`${"€".repeat(level)}, price level ${level} of 4`} onClick={() => props.onPrices(toggle(prices, level))}>
              {"€".repeat(level)}
            </Chip>
          ))}
        </Chips>
        <Chips label="Access">
          <Chip pressed={features.includes("accessible")} onClick={() => props.onFeatures(toggle(features, "accessible" as FeatureKey))}>
            {FEATURE_LABELS.accessible}
          </Chip>
          {props.hasWhen && (
            <Chip pressed={props.availableOnly} onClick={() => props.onAvailableOnly(!props.availableOnly)}>
              Available at that time
            </Chip>
          )}
        </Chips>
      </div>
    </Dialog>
  );
}
