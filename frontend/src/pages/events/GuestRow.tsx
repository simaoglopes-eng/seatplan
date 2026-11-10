// One guest in the organiser's list: name, where they sit (in words, not
// colour), and the actions for that person. The row can be dragged onto the
// map; "Place" is the keyboard way to do the same. Each button's accessible
// name adds the guest's name ("Place Bea Costa"), because a list of 28
// identical "Place" buttons does not tell which guest each one is for. The
// name starts with the visible words, so speech control ("click Place") works.
import { useState } from "react";
import type { DragEvent } from "react";
import type { OrganiserGuest } from "../../api/events";
import { Badge, Button, Dialog } from "../../design/components";
import type { BadgeTone } from "../../design/components";

interface GuestRowProps {
  guest: OrganiserGuest;
  seatLabel: string | null;
  selected: boolean;
  link: string | undefined;
  busy: string | null;
  onPlace: () => void;
  onCopyLink: () => void;
  onNewLink: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}

function status(guest: OrganiserGuest, seatLabel: string | null): { tone: BadgeTone; text: string } {
  if (guest.rsvp === "no") return { tone: "neutral", text: "Not coming" };
  if (seatLabel) return { tone: "success", text: seatLabel };
  if (guest.rsvp === "pending") return { tone: "warning", text: "No reply yet" };
  return { tone: "warning", text: "No seat yet" };
}

export function GuestRow(props: GuestRowProps) {
  const { guest, seatLabel, selected, link } = props;
  // Both actions undo something for the guest, so both ask first.
  const [asking, setAsking] = useState<"delete" | "link" | null>(null);
  const close = () => setAsking(null);
  const badge = status(guest, seatLabel);

  const onDragStart = (event: DragEvent<HTMLLIElement>): void => {
    event.dataTransfer.setData("text/plain", String(guest.id));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <li className={`ev-guest ${selected ? "is-selected" : ""}`.trim()} draggable onDragStart={onDragStart}>
      <div className="ev-guest-main">
        <span className="ev-guest-name">{guest.name}</span>
        <Badge tone={badge.tone}>{badge.text}</Badge>
        {guest.needs_accessible && <Badge tone="info">Needs accessible seat</Badge>}
      </div>
      <div className="ev-guest-actions">
        <Button
          variant={selected ? "primary" : "secondary"}
          aria-pressed={selected}
          aria-label={selected ? `Choosing seat for ${guest.name}...` : `Place ${guest.name}`}
          onClick={props.onPlace}
        >
          {selected ? "Choosing seat..." : "Place"}
        </Button>
        {link ? (
          <Button variant="ghost" aria-label={`Copy link for ${guest.name}`} onClick={props.onCopyLink}>
            Copy link
          </Button>
        ) : (
          <Button variant="ghost" aria-label={`New link for ${guest.name}`} onClick={() => setAsking("link")}>
            New link
          </Button>
        )}
        <Button variant="ghost" aria-label={`Delete data of ${guest.name}`} onClick={() => setAsking("delete")}>
          Delete data
        </Button>
      </div>
      <Dialog
        open={asking === "link"}
        title={`Make a new link for ${guest.name}?`}
        onClose={close}
        actions={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button busy={props.busy === `link-${guest.id}`} onClick={() => void props.onNewLink().then(close)}>
              Make new link
            </Button>
          </>
        }
      >
        <p>Their current link stops working at once. Use this when a link was lost or shared by mistake, then send them the new one.</p>
      </Dialog>
      <Dialog
        open={asking === "delete"}
        title={`Delete ${guest.name}'s data?`}
        onClose={close}
        actions={
          <>
            <Button variant="secondary" onClick={close}>
              Keep guest
            </Button>
            <Button variant="danger" busy={props.busy === `delete-${guest.id}`} onClick={() => void props.onDelete().then(close)}>
              Delete for good
            </Button>
          </>
        }
      >
        <p>This erases their name, email, seat and personal link. It cannot be undone.</p>
      </Dialog>
    </li>
  );
}
