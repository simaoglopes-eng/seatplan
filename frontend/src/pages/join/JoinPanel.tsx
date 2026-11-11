// The panel that opens under the visitor's map when they pick a free seat.
// Picking a seat does NOT hold it (a visitor cannot hold seats): the panel
// only explains that choosing it needs an account, and offers the buttons.
//
// Keyboard: the heading takes focus when the panel opens or the seat changes;
// Escape closes the panel and the page puts focus back on the map.
import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "../../design/components";

interface JoinPanelProps {
  /** The seat id, so focus moves again when another seat is picked. */
  seatId: number;
  heading: string;
  /** What happens next, in one or two sentences. */
  text: string;
  /** The buttons that lead on (create an account, sign in, or join). */
  actions: ReactNode;
  onClose: () => void;
}

export function JoinPanel({ seatId, heading, text, actions, onClose }: JoinPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [seatId]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  };

  return (
    <section className="join-panel" aria-labelledby="join-panel-title" onKeyDown={onKeyDown}>
      <h2 ref={headingRef} id="join-panel-title" tabIndex={-1} className="join-panel-title">
        {heading}
      </h2>
      <p>{text}</p>
      <div className="join-actions">{actions}</div>
      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
    </section>
  );
}
