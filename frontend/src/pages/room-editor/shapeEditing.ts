import { outlineToPolygon, polygonArea, sideLength, sidePoint } from "./geometry";
import type { OutlinePoint, Point } from "./geometry";
import type { Room } from "./roomModel";

function withPoints(room: Room, points: OutlinePoint[]): Room {
  points.forEach((point, i) => {
    const next = points[(i + 1) % points.length];
    const chord = Math.hypot(next.x - point.x, next.y - point.y);
    if (![point.x, point.y, point.curve].every(Number.isFinite) || chord < 1 || Math.abs(point.curve) > chord / 2 + 1e-8) throw new Error("Keep corners apart and curves within half the wall length.");
  });
  return { ...room, outline: { points } };
}

export function moveCorner(room: Room, index: number, at: Point): Room {
  return withPoints(room, room.outline.points.map((point, i) => i === index ? { ...point, ...at } : point));
}

export function setSideCurve(room: Room, index: number, curve: number): Room {
  return withPoints(room, room.outline.points.map((point, i) => i === index ? { ...point, curve } : point));
}

export function setSideLength(room: Room, index: number, length: number): Room {
  const a = room.outline.points[index], next = (index + 1) % room.outline.points.length;
  const b = room.outline.points[next], chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (!Number.isFinite(length) || length < 1 || !chord) throw new Error("Use a positive wall length.");
  let wantedChord = length;
  if (a.curve) {
    if (length < Math.PI * Math.abs(a.curve)) throw new Error("Reduce the bulge before shortening this wall.");
    let low = 2 * Math.abs(a.curve), high = length;
    for (let i = 0; i < 50; i++) {
      const middle = (low + high) / 2, s = a.curve;
      const arc = Math.abs((middle * middle / 4 + s * s) / (2 * s) * 4 * Math.atan(2 * s / middle));
      if (arc < length) low = middle; else high = middle;
    }
    wantedChord = (low + high) / 2;
  }
  return moveCorner(room, next, { x: a.x + (b.x - a.x) / chord * wantedChord, y: a.y + (b.y - a.y) / chord * wantedChord });
}

export function insertCorner(room: Room, side: number): Room {
  if (room.outline.points.length >= 60) throw new Error("A room can have at most 60 corners.");
  const half = sideLength(room.outline, side) / 2;
  if (room.openings.some(o => o.side === side && o.offset < half && o.offset + o.width > half)) throw new Error("Move the opening away from the midpoint before adding a corner.");
  const a = room.outline.points[side], b = room.outline.points[(side + 1) % room.outline.points.length];
  const chord = Math.hypot(b.x - a.x, b.y - a.y), s = a.curve;
  const radius = s ? Math.abs((chord * chord / 4 + s * s) / (2 * s)) : 0;
  const curve = s ? Math.sign(s) * radius * (1 - Math.cos(Math.atan(2 * s / chord))) : 0;
  const points = room.outline.points.map((p, i) => i === side ? { ...p, curve } : p);
  points.splice(side + 1, 0, { ...sidePoint(room.outline, side, 0.5), curve });
  const openings = room.openings.map(o => o.side > side ? { ...o, side: o.side + 1 } : o.side === side && o.offset >= half ? { ...o, side: side + 1, offset: o.offset - half } : o);
  return { ...withPoints(room, points), openings };
}

export function removeCorner(room: Room, index: number): Room {
  const count = room.outline.points.length;
  if (count <= 3) throw new Error("Keep at least three corners.");
  const previous = (index + count - 1) % count;
  if (room.openings.some(o => o.side === index || o.side === previous)) throw new Error("Move openings off the adjoining walls before removing this corner.");
  const points = room.outline.points.flatMap((p, i) => i === index ? [] : [{ ...p, curve: i === previous ? 0 : p.curve }]);
  return { ...withPoints(room, points), openings: room.openings.map(o => ({ ...o, side: o.side > index ? o.side - 1 : o.side })) };
}

export function appendCorner(room: Room, point: Point): Room {
  const points = room.outline.points;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || points.length >= 60) return room;
  if (points.some((p, i) => (i === 0 || i === points.length - 1) && Math.hypot(point.x - p.x, point.y - p.y) < 1)) return room;
  return { ...room, outline: { points: [...points, { ...point, curve: 0 }] } };
}

export function finishOutline(room: Room): Room {
  if (room.outline.points.length < 3) throw new Error("Add at least three corners.");
  if (polygonArea(outlineToPolygon(room.outline)) >= 0) return room;
  const old = room.outline.points, n = old.length;
  const points = [...old].reverse().map((p, i) => ({ ...p, curve: -old[(n - 2 - i + n) % n].curve }));
  const openings = room.openings.map(o => ({ ...o, side: (n - 2 - o.side + n) % n, offset: sideLength(room.outline, o.side) - o.offset - o.width }));
  return { ...room, outline: { points }, openings };
}
