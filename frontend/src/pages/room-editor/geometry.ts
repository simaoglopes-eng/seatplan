// Screen coordinates in centimetres. These cases match ambience/geometry.py.
export interface Point { x: number; y: number }
export interface OutlinePoint extends Point { curve: number }
export interface Outline { points: OutlinePoint[] }
export interface Box extends Point { w: number; h: number; rotation: number }

export function polygonArea(points: readonly Point[]): number {
  return points.reduce((area, a, i) => {
    const b = points[(i + 1) % points.length];
    return area + a.x * b.y - b.x * a.y;
  }, 0) / 2;
}

export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) <= 1e-8 && Math.min(a.x, b.x) <= point.x && point.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= point.y && point.y <= Math.max(a.y, b.y)) return true;
    if ((a.y > point.y) !== (b.y > point.y)) {
      const crossing = a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y);
      if (point.x < crossing) inside = !inside;
    }
  }
  return inside;
}

export function bearing(dx: number, dy: number, north: number): number {
  if (![dx, dy, north].every(Number.isFinite) || (!dx && !dy)) throw new Error("A finite nonzero direction is required.");
  return ((Math.atan2(dx, -dy) * 180 / Math.PI - north) % 360 + 360) % 360;
}

export function rectCorners(box: Box): Point[] {
  const a = box.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  return [[-box.w / 2, -box.h / 2], [box.w / 2, -box.h / 2], [box.w / 2, box.h / 2], [-box.w / 2, box.h / 2]].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
}

export function sidePoint(outline: Outline, side: number, fraction: number): Point {
  const a = outline.points[side], b = outline.points[(side + 1) % outline.points.length];
  const dx = b.x - a.x, dy = b.y - a.y, chord = Math.hypot(dx, dy), sagitta = a.curve;
  if (!chord || Math.abs(sagitta) > chord / 2 || fraction < 0 || fraction > 1) throw new Error("Invalid side or arc fraction.");
  if (!sagitta) return { x: a.x + fraction * dx, y: a.y + fraction * dy };
  const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta);
  const cx = (a.x + b.x) / 2 - dy / chord * (radius - sagitta);
  const cy = (a.y + b.y) / 2 + dx / chord * (radius - sagitta);
  const angle = Math.atan2(a.y - cy, a.x - cx) + fraction * 4 * Math.atan(2 * sagitta / chord);
  return { x: cx + Math.abs(radius) * Math.cos(angle), y: cy + Math.abs(radius) * Math.sin(angle) };
}

export function sideNormal(outline: Outline, side: number, fraction: number): Point {
  const a = sidePoint(outline, side, Math.max(0, fraction - 1e-6));
  const b = sidePoint(outline, side, Math.min(1, fraction + 1e-6));
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (!length) throw new Error("A nonzero side is required.");
  return { x: dy / length, y: -dx / length };
}

export function outlineToPolygon(outline: Outline, segmentsPerArc = 16): Point[] {
  if (outline.points.length < 3 || outline.points.length > 60 || !Number.isInteger(segmentsPerArc) || segmentsPerArc < 1) throw new Error("Invalid outline size.");
  if (!outline.points.every(p => [p.x, p.y, p.curve].every(Number.isFinite))) throw new Error("Coordinates must be finite.");
  return outline.points.flatMap((p, side) => {
    const count = p.curve ? segmentsPerArc : 1;
    return Array.from({ length: count }, (_, step) => sidePoint(outline, side, step / count));
  });
}
