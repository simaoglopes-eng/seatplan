// The diner's time cursor over the stay. Moving it asks the light route for
// the sun patches and the night veil at that moment, 250 ms after the last
// move, so dragging the slider sends one request instead of dozens. The map,
// the hold and the live updates are never touched: only the light changes.
import { useEffect, useRef, useState } from "react";
import { getAmbience } from "../../api/restaurant";
import type { AmbienceAnswer, PartyNeeds } from "../../api/restaurant";

export const LIGHT_DEBOUNCE_MS = 250;

export interface LightCursor {
  index: number;
  setIndex: (index: number) => void;
  /** The light at the cursor, or null while it is still at the start of the stay. */
  answer: AmbienceAnswer | null;
  failed: boolean;
}

export function useLightCursor(venueId: string, needs: PartyNeeds, time: string, steps: string[]): LightCursor {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<AmbienceAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  // Only the newest request may change the picture: a slow old answer must not overwrite a newer one.
  const newest = useRef(0);

  useEffect(() => {
    if (index === 0 && answer === null) return; // the map already shows the start of the stay
    const ticket = ++newest.current;
    const timer = setTimeout(() => {
      getAmbience(venueId, needs, time, steps[index])
        .then((light) => {
          if (ticket !== newest.current) return;
          setAnswer(light);
          setFailed(false);
        })
        .catch(() => {
          if (ticket === newest.current) setFailed(true);
        });
    }, LIGHT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // The cursor position is the only trigger: the needs and time belong to this map.
  }, [index]);

  return { index, setIndex, answer, failed };
}
