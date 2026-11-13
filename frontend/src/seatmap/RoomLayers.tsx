// The room as scenery on the diner map (spec 9.3): floor, sun patches, fixed
// items, curved walls, windows and doors, a small icon where a window has a
// view, and the night veil. Nothing here is a target or is read out: the facts
// (light, view, what is near) reach screen readers through the table cards.
// The layers are memoised, so panning (which re-renders the map every frame)
// does not redraw them.
import { memo } from "react";
import type { MapRoom, MapRoomFixture } from "../api/types";
import { doorArcPath, fixtureName, openingPath, outlinePath, polygonPath, viewAnchors } from "./roomScene";

const roomKey = (room: MapRoom): string => String(room.id ?? "implicit");

/** The stripes that mark direct sun. A pattern, not just a colour, so it also reads in greyscale. */
export function RoomDefs({ prefix }: { prefix: string }) {
  return (
    <defs>
      <pattern id={`${prefix}-sun`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="12" height="12" className="pat-sun-bg" />
        <rect width="3" height="12" className="pat-sun-fg" />
      </pattern>
    </defs>
  );
}

function Fixture({ fixture }: { fixture: MapRoomFixture }) {
  const cx = fixture.x + fixture.w / 2;
  const cy = fixture.y + fixture.h / 2;
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${fixture.rotation})`} className={`room-fixture room-fixture-${fixture.kind}`}>
      {fixture.shape === "circle" ? (
        <ellipse rx={fixture.w / 2} ry={fixture.h / 2} />
      ) : (
        <rect x={-fixture.w / 2} y={-fixture.h / 2} width={fixture.w} height={fixture.h} rx="4" />
      )}
      <text className="room-fixture-label" textAnchor="middle" dominantBaseline="central" transform={`rotate(${-fixture.rotation})`}>
        {fixtureName(fixture)}
      </text>
    </g>
  );
}

interface BackdropProps {
  room: MapRoom;
  /** Prefix of this map's SVG ids, so two maps on one page never share a clip path. */
  mapId: string;
  showSun?: boolean;
}

/** Everything of a room that lies under the tables. */
export const RoomBackdrop = memo(function RoomBackdrop({ room, mapId, showSun = true }: BackdropProps) {
  const clipId = `${mapId}-room-${roomKey(room)}`;
  const outline = outlinePath(room.outline);
  const icons = viewAnchors(room);
  return (
    <g data-room={roomKey(room)} aria-hidden="true" className={room.is_outdoor ? "room room-outdoor" : "room"}>
      <clipPath id={clipId}>
        <path d={outline} />
      </clipPath>
      <path d={outline} className="room-floor" />
      {showSun && room.sun_patches.length > 0 && (
        <g clipPath={`url(#${clipId})`}>
          {room.sun_patches.map((patch, i) => (
            <path key={i} d={polygonPath(patch)} fill={`url(#${mapId}-sun)`} className="room-sun" />
          ))}
        </g>
      )}
      {room.fixtures.map((fixture) => (
        <Fixture key={fixture.id} fixture={fixture} />
      ))}
      <path d={outline} className="room-wall" />
      {room.openings.map((opening) => {
        const path = openingPath(room.outline, opening);
        return (
          <g key={opening.id} data-opening={opening.id}>
            <path d={path} className="room-opening-gap" />
            {opening.kind === "door" ? (
              <path d={doorArcPath(room.outline, opening)} className="room-door-arc" />
            ) : (
              <>
                <path d={path} className="room-window" />
                <path d={path} className="room-window-middle" />
              </>
            )}
          </g>
        );
      })}
      {icons.map((icon) => (
        <g key={icon.id} className="room-view-icon" transform={`translate(${icon.x} ${icon.y})`}>
          <circle r="11" />
          <path d="M-7 0Q0 -6 7 0Q0 6 -7 0Z" />
          <circle r="2.2" className="room-view-pupil" />
        </g>
      ))}
    </g>
  );
});

/** The dark-blue veil after sunset. It sits on top but never catches a tap. */
export const RoomNight = memo(function RoomNight({ room }: { room: MapRoom }) {
  if (!room.night) return null;
  return <path d={outlinePath(room.outline)} className="room-night" aria-hidden="true" />;
});
