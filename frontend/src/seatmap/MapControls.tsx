// Zoom in, zoom out and fit. Buttons as well as gestures, because not
// everyone can pinch or has a mouse wheel (WCAG 2.5.7, dragging movements).
import type { RefObject } from "react";

interface MapControlsProps {
  /** The first button; Escape inside the map moves focus here. */
  leaveRef: RefObject<HTMLButtonElement>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Optional fourth button, e.g. "Zoom to the recommended seat". Shown only when given. */
  focus?: { label: string; onClick: () => void } | null;
}

export function MapControls({ leaveRef, onZoomIn, onZoomOut, onFit, focus }: MapControlsProps) {
  return (
    <div className="seatmap-controls" role="group" aria-label="Map view">
      <button ref={leaveRef} type="button" className="map-control" onClick={onZoomIn} aria-label="Zoom in">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button type="button" className="map-control" onClick={onZoomOut} aria-label="Zoom out">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <button type="button" className="map-control" onClick={onFit} aria-label="Fit map to screen">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
        </svg>
      </button>
      {focus && (
        <button type="button" className="map-control" onClick={focus.onClick} aria-label={focus.label} title={focus.label}>
          {/* A target: "take me to it". */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      )}
    </div>
  );
}
