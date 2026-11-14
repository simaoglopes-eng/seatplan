// What the results map shows when its tiles cannot load (no network, a blocked tile server, a
// deployment that refuses them): a clean diagram on paper with the numbered pins, so the page is
// never a grey box. The list next to it is still the way to every restaurant; this only keeps the
// "where" readable. Pins are buttons, so they work with the keyboard like the real map's pins.
import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import { BOX, placePins } from "./schematic";
import type { PinPoint } from "./schematic";
import "./maps.css";

interface Props {
  pins: PinPoint[];
  highlightedId: string | null;
  onSelect: (id: string) => void;
  centre?: { lat: number; lng: number } | null;
}

export function SchematicMap({ pins, highlightedId, onSelect, centre }: Props) {
  const schematic = useMemo(() => placePins(pins, centre), [pins, centre?.lat, centre?.lng]);
  const press = (event: KeyboardEvent, id: string): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  };
  return (
    <div className="schematic" role="region" aria-label="Diagram of where the restaurants are">
      <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} preserveAspectRatio="xMidYMid meet" className="schematic-svg">
        {[25, 50, 75].map((x) => (
          <line key={`v${x}`} x1={x} y1="0" x2={x} y2={BOX.height} className="schematic-grid" />
        ))}
        {[25, 50].map((y) => (
          <line key={`h${y}`} x1="0" y1={y} x2={BOX.width} y2={y} className="schematic-grid" />
        ))}
        <g className="schematic-north" aria-hidden="true" transform="translate(93 9)">
          <path d="M0 -5 L2.4 2 L0 0.8 L-2.4 2 Z" />
          <text y="8" textAnchor="middle">
            N
          </text>
        </g>
        {schematic.centre && (
          <g transform={`translate(${schematic.centre.x} ${schematic.centre.y})`} className="schematic-centre">
            <rect x="-2.2" y="-2.2" width="4.4" height="4.4" transform="rotate(45)" />
            <text y="-5" textAnchor="middle">
              You
            </text>
          </g>
        )}
        {schematic.pins.map((pin) => (
          <g
            key={pin.id}
            role="button"
            tabIndex={0}
            aria-label={`${pin.number}. ${pin.name}`}
            className={`schematic-pin${highlightedId === pin.id ? " is-active" : ""}`}
            transform={`translate(${pin.x} ${pin.y})`}
            onClick={() => onSelect(pin.id)}
            onKeyDown={(event) => press(event, pin.id)}
          >
            <circle r="5.2" className="schematic-pin-hit" />
            <circle r={highlightedId === pin.id ? 4.4 : 3.6} className="schematic-pin-disc" />
            <text y="1.3" textAnchor="middle" className="schematic-pin-number">
              {pin.number}
            </text>
          </g>
        ))}
        {schematic.scale && (
          <g transform={`translate(6 ${BOX.height - 6})`} className="schematic-scale" aria-hidden="true">
            <line x1="0" y1="0" x2={schematic.scale.width} y2="0" />
            <line x1="0" y1="-1.4" x2="0" y2="1.4" />
            <line x1={schematic.scale.width} y1="-1.4" x2={schematic.scale.width} y2="1.4" />
            <text x={schematic.scale.width / 2} y="-2" textAnchor="middle">
              {schematic.scale.label}
            </text>
          </g>
        )}
      </svg>
      <p role="status" className="schematic-note">
        The map tiles are not available, so this is a simple diagram. Numbers match the list.
      </p>
    </div>
  );
}
