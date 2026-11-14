// The plain diagram that replaces the map when its tiles cannot load: where the restaurants are
// relative to each other, as numbered pins on paper, with a scale bar. Pure maths, no Leaflet.

export interface PinPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface PlacedPin extends PinPoint {
  /** 1, 2, 3... in the order of the list, so a card and its pin share a number. */
  number: number;
  /** Position in the diagram, in a 100 x 75 box. */
  x: number;
  y: number;
}

export interface Schematic {
  pins: PlacedPin[];
  centre: { x: number; y: number } | null;
  /** The scale bar: its length in the diagram and what it stands for, "500 m" or "2 km". */
  scale: { width: number; label: string } | null;
}

export const BOX = { width: 100, height: 75 };
const METERS_PER_DEGREE = 111_320;
const NICE_METERS = [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000];
const MIN_SPAN_DEGREES = 0.006; // about 600 m: a single pin is not zoomed to infinity

function niceLabel(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

/** Lays the pins out on paper. Longitude is shrunk by the cosine of the latitude so distances look right. */
export function placePins(pins: PinPoint[], centre?: { lat: number; lng: number } | null): Schematic {
  const points = [...pins.map((p) => ({ lat: p.lat, lng: p.lng })), ...(centre ? [centre] : [])];
  if (points.length === 0) return { pins: [], centre: null, scale: null };
  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const shrink = Math.cos((meanLat * Math.PI) / 180);
  const xs = points.map((p) => p.lng * shrink);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, MIN_SPAN_DEGREES);
  const spanY = Math.max(maxY - minY, MIN_SPAN_DEGREES);
  // Leave room for the numbers and the scale bar: the pins use the middle 80 % by 65 % of the box.
  const unitsPerDegree = Math.min((BOX.width * 0.8) / spanX, (BOX.height * 0.65) / spanY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const toBox = (lng: number, lat: number): { x: number; y: number } => ({
    x: BOX.width / 2 + (lng * shrink - midX) * unitsPerDegree,
    y: BOX.height / 2 - (lat - midY) * unitsPerDegree - 3,
  });
  const metersPerUnit = METERS_PER_DEGREE / unitsPerDegree;
  const fits = NICE_METERS.filter((meters) => meters / metersPerUnit <= BOX.width * 0.3);
  const length = fits.length > 0 ? fits[fits.length - 1] : null;
  return {
    pins: pins.map((p, index) => ({ ...p, number: index + 1, ...toBox(p.lng, p.lat) })),
    centre: centre ? toBox(centre.lng, centre.lat) : null,
    scale: length === null ? null : { width: length / metersPerUnit, label: niceLabel(length) },
  };
}
