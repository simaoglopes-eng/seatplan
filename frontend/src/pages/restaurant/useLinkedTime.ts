// A link from the discovery page carries a time as well as a date and party
// (/restaurants/<slug>?date=&time=&party=). When all three make sense we check,
// once, that the time is still free and go straight to choosing a table; if it
// is gone the diner lands on the list of times with a short message.
import { useEffect, useRef, useState } from "react";
import { getSlots } from "../../api/restaurant";
import type { PartyNeeds } from "../../api/restaurant";
import type { LinkAnswers } from "./useBookingFlow";
import { STEP } from "./useBookingFlow";
/** The linked time when it is a clock time on the date the flow actually starts with, else null. */
export function linkedTime(needs: PartyNeeds, link: LinkAnswers): string | null {
  const time = link.time ?? "";
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && link.date === needs.date && Number(link.party) === needs.party ? time : null;
}
interface Flow {
  needs: PartyNeeds;
  pickTime: (time: string) => void;
  go: (step: number) => void;
}
export function useLinkedTime(venueId: string, link: LinkAnswers, flow: Flow): { checking: boolean; notice: string | null } {
  const wanted = linkedTime(flow.needs, link);
  const [checking, setChecking] = useState(wanted !== null);
  const [notice, setNotice] = useState<string | null>(null);
  const started = useRef(false);
  const latest = useRef(flow);
  latest.current = flow;
  useEffect(() => {
    if (wanted === null || started.current) return;
    started.current = true;
    const { needs } = latest.current;
    getSlots(venueId, needs.date, needs.party).then(
      (answer) => {
        const slot = answer.slots.find((s) => s.time === wanted);
        setChecking(false);
        if (slot && slot.status !== "full" && slot.reason !== "past") latest.current.pickTime(wanted);
        else {
          setNotice(`${wanted} is not free any more. Please pick another time.`);
          latest.current.go(STEP.time);
        }
      },
      () => { setChecking(false); setNotice(`We could not verify ${wanted}. Please check the times below.`); latest.current.go(STEP.time); },
    );
  }, [venueId, wanted]);
  return { checking, notice };
}
