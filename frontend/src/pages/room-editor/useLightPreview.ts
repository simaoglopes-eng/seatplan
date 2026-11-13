// Asks for the saved rooms' light while the Light tool is open: 250 ms after the
// date or time stops changing, and again when a save changes the saved rooms.
// A slow old answer never overwrites a newer one; a failure keeps the last picture.
import { useEffect, useRef, useState } from "react";
import { getLightPreview } from "../../api/rooms";
import type { AmbienceAnswer } from "../../api/restaurant";

export const LIGHT_DEBOUNCE_MS = 250;

export function useLightPreview(venueId: string, enabled: boolean, date: string, time: string, savedVersion: number) {
  const [answer, setAnswer] = useState<AmbienceAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const newest = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const ticket = ++newest.current;
    const timer = window.setTimeout(() => {
      getLightPreview(venueId, date, time)
        .then((light) => {
          if (ticket !== newest.current) return;
          setAnswer(light);
          setFailed(false);
        })
        .catch(() => {
          if (ticket === newest.current) setFailed(true);
        });
    }, LIGHT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [venueId, enabled, date, time, savedVersion]);

  return { answer, failed };
}
