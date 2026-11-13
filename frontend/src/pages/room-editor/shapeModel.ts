import type { Point } from "./geometry";
import { createRoom } from "./roomModel";
import type { Room } from "./roomModel";

export type InitialShape = "rectangle" | "l-shape" | "draw";

export function createInitialShape(name: string, shape: InitialShape, width: number, height: number, cutWidth: number, cutHeight: number, outdoor: boolean): Room {
  if (!name.trim() || name.trim().length > 60) throw new Error("Use a room name of 1-60 characters.");
  const room = createRoom(name, width, height, outdoor);
  if (shape === "l-shape") {
    if (![cutWidth, cutHeight].every(Number.isFinite) || cutWidth <= 0 || cutWidth >= width || cutHeight <= 0 || cutHeight >= height) throw new Error("The cutout must fit inside the room.");
    room.outline = { points: [[0, 0], [width - cutWidth, 0], [width - cutWidth, cutHeight], [width, cutHeight], [width, height], [0, height]].map(([x, y]) => ({ x, y, curve: 0 })) };
  }
  if (shape === "draw") room.outline = { points: [] };
  return room;
}

export function snappedPoint(point: Point, previous: Point | null, grid: boolean, constrain: boolean): Point {
  const result = grid ? { x: Math.round(point.x / 50) * 50, y: Math.round(point.y / 50) * 50 } : point;
  if (!constrain || !previous) return result;
  const dx = result.x - previous.x, dy = result.y - previous.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
  const diagonal = Math.abs(Math.sin(angle) * Math.cos(angle)) > 0.1;
  const length = Math.max(Math.abs(dx), Math.abs(dy)) * (diagonal ? Math.SQRT2 : 1);
  return { x: Math.round((previous.x + length * Math.cos(angle)) * 1e6) / 1e6, y: Math.round((previous.y + length * Math.sin(angle)) * 1e6) / 1e6 };
}
