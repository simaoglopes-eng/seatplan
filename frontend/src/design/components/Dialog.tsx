// A modal dialog. While open: focus moves inside, Tab cycles inside (focus
// trap), Escape closes, and focus returns to whatever opened it.
//
// The keys are handled on the whole document, not on the panel: when the
// focused control disappears (content replaced, a button removed), focus falls
// to <body>, outside the panel, and a panel-only handler would never hear
// Escape or Tab again.
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons shown at the bottom, e.g. Cancel and Confirm. */
  actions?: ReactNode;
  /** "side" slides a full-height drawer in from the right (filters); the default is the centred dialog. */
  placement?: "center" | "side";
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

export function Dialog({ open, title, onClose, children, actions, placement = "center" }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Latest-value ref, so the document listener always calls the newest onClose.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Focus the first control, or the panel itself if it has none.
    (panel ? (focusableIn(panel)[0] ?? panel) : null)?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (panel) handleDialogKey(event, panel, () => closeRef.current());
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={`dialog-backdrop${placement === "side" ? " dialog-backdrop-side" : ""}`} onMouseDown={onClose}>
      <div
        ref={panelRef}
        className={`dialog${placement === "side" ? " dialog-side" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <div className="dialog-body">{children}</div>
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** Escape closes; Tab and Shift+Tab stay inside the panel. */
function handleDialogKey(event: KeyboardEvent, panel: HTMLElement, close: () => void): void {
  // A control inside (for example a seat map leaving with Escape) already used the key.
  if (event.defaultPrevented) return;
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (event.key === "Tab") {
    trapTab(event, panel);
  }
}

/**
 * Keeps Tab and Shift+Tab inside the dialog by wrapping at both ends. The
 * list of controls is read again on every key press, because the content may
 * have changed since the dialog opened.
 */
function trapTab(event: KeyboardEvent, panel: HTMLElement): void {
  const items = focusableIn(panel);
  const first = items[0] ?? panel;
  const last = items[items.length - 1] ?? panel;
  const active = document.activeElement;
  if (!panel.contains(active) || active === panel) {
    // Focus fell out (its control vanished) or sits on the panel itself: bring it to a control.
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (items.length === 0 || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}
