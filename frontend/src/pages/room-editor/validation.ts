import { outlineToPolygon, pointInPolygon, polygonArea, rectCorners } from "./geometry";
import type { Point } from "./geometry";
import type { Room, RoomFixture, RoomTable } from "./roomModel";

export type ProblemCode = "outline_invalid" | "table_outside" | "tables_overlap" | "tight_passage" | "fixture_overlap" | "no_north" | "window_no_view" | "no_tables";
export interface RoomProblem { code: ProblemCode; level: "error" | "warning" | "info"; message: string; room_key: string | null; table_keys: string[]; opening_key?: string; fixture_key?: string }
const EPS = 1e-6;
interface Shape { centre: Point; radius: number | null; polygon: Point[] }
function shape(item: RoomTable | RoomFixture, margin = 0): Shape {
  const centre = { x: item.x + item.w / 2, y: item.y + item.h / 2 };
  return item.shape === "round" || item.shape === "circle" ? { centre, radius: item.w / 2 + margin, polygon: [] } : { centre, radius: null, polygon: rectCorners({ x: item.x - margin, y: item.y - margin, w: item.w + margin * 2, h: item.h + margin * 2, rotation: item.rotation }) };
}
function edges(polygon: Point[]): [Point, Point][] { return polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]]); }
function distance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function crosses(a: Point, b: Point, c: Point, d: Point, proper = false): boolean {
  if (Math.max(a.x, b.x) + EPS < Math.min(c.x, d.x) || Math.max(c.x, d.x) + EPS < Math.min(a.x, b.x) || Math.max(a.y, b.y) + EPS < Math.min(c.y, d.y) || Math.max(c.y, d.y) + EPS < Math.min(a.y, b.y)) return false;
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS) return true;
  return !proper && [distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b)].some(n => n < EPS);
}
function outline(room: Room): Point[] | null {
  try {
    const points = outlineToPolygon(room.outline), lines = edges(points);
    if (Math.abs(polygonArea(points)) < EPS) return null;
    for (let i = 0; i < lines.length; i++) {
      const [a, b] = lines[i]; if (Math.hypot(a.x - b.x, a.y - b.y) < EPS) return null;
      for (let j = i + 2; j < lines.length; j++) { if (i === 0 && j === lines.length - 1) continue; if (crosses(a, b, ...lines[j])) return null; }
    }
    return points;
  } catch { return null; }
}
function inside(item: Shape, polygon: Point[]): boolean {
  if (!pointInPolygon(item.centre, polygon)) return false;
  if (item.radius !== null) return edges(polygon).every(([a, b]) => distance(item.centre, a, b) + EPS >= item.radius!);
  return item.polygon.every(p => pointInPolygon(p, polygon)) && !edges(item.polygon).some(([a, b]) => edges(polygon).some(([c, d]) => crosses(a, b, c, d, true)));
}
function penetration(a: Shape, b: Shape): number | null {
  if (a.radius !== null && b.radius !== null) { const depth = a.radius + b.radius - Math.hypot(a.centre.x - b.centre.x, a.centre.y - b.centre.y); return depth > EPS ? depth : null; }
  const axes = [...edges(a.polygon), ...edges(b.polygon)].map(([p, q]) => ({ x: -(q.y - p.y), y: q.x - p.x }));
  for (const [circle, other] of [[a, b], [b, a]]) {
    if (circle.radius !== null && other.polygon.length) { const closest = [...other.polygon].sort((p, q) => Math.hypot(p.x - circle.centre.x, p.y - circle.centre.y) - Math.hypot(q.x - circle.centre.x, q.y - circle.centre.y))[0]; axes.push({ x: closest.x - circle.centre.x, y: closest.y - circle.centre.y }); }
  }
  let depth = Infinity;
  for (const axis of axes) {
    const length = Math.hypot(axis.x, axis.y); if (length < EPS) continue;
    const nx = axis.x / length, ny = axis.y / length;
    const intervals = [a, b].map(item => {
      if (item.radius !== null) { const centre = item.centre.x * nx + item.centre.y * ny; return [centre - item.radius, centre + item.radius]; }
      const values = item.polygon.map(p => p.x * nx + p.y * ny); return [Math.min(...values), Math.max(...values)];
    });
    const [[amin, amax], [bmin, bmax]] = intervals, overlap = Math.min(amax - bmin, bmax - amin);
    if (overlap <= EPS) return null;
    depth = Math.min(depth, overlap);
  }
  return depth;
}
const label = (table: RoomTable) => table.label.toLowerCase().startsWith("table ") ? table.label.slice(6) : table.label;

export function validateRooms(rooms: Room[], forPublication = false): RoomProblem[] {
  const problems: RoomProblem[] = [];
  for (const room of rooms) {
    const polygon = outline(room);
    const add = (code: ProblemCode, level: RoomProblem["level"], message: string, table_keys: string[], details: Partial<RoomProblem> = {}) => problems.push({ code, level, message, room_key: room.key, table_keys, ...details });
    if (!polygon) add("outline_invalid", "error", "The walls cross each other.", []);
    const windows = room.openings.filter(o => o.kind === "window" || o.kind === "glass_wall");
    if (forPublication && windows.length && room.north_deg === null) add("no_north", "error", "Set north so we can work out the sun.", []);
    for (const opening of windows) if (!opening.view_text.trim()) add("window_no_view", "info", "Add what guests see from this window.", [], { opening_key: opening.key });
    room.tables.forEach((table, i) => {
      if (polygon && !inside(shape(table), polygon)) add("table_outside", "error", `Table ${label(table)} is outside the walls.`, [table.key]);
      for (const other of room.tables.slice(i + 1)) {
        const depth = penetration(shape(table), shape(other)), sameGroup = table.combine_group && table.combine_group === other.combine_group;
        if (table.is_active && other.is_active && depth !== null && depth > (sameGroup ? 2 + EPS : EPS)) add("tables_overlap", "error", `Tables ${label(table)} and ${label(other)} overlap.`, [table.key, other.key]);
        if (penetration(shape(table, 45), shape(other, 45)) !== null) add("tight_passage", "warning", `Little room to walk between tables ${label(table)} and ${label(other)}.`, [table.key, other.key]);
      }
      for (const fixture of room.fixtures) if (penetration(shape(table), shape(fixture)) !== null) add("fixture_overlap", "warning", `Table ${label(table)} overlaps the ${fixture.label || fixture.kind.replaceAll("_", " ")}.`, [table.key], { fixture_key: fixture.key });
    });
  }
  if (forPublication && !rooms.some(r => r.tables.some(t => t.is_active))) problems.push({ code: "no_tables", level: "error", message: "Add at least one table.", room_key: null, table_keys: [] });
  return problems;
}
