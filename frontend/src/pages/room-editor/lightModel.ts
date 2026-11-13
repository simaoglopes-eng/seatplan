// The words and numbers behind the editor's Light tool (spec 7.7): what to say
// about the sun at a time, the slider's steps, the shortcut buttons and where on
// screen the sun is. Pure, so each rule is tested on its own.
import type { MapRoomSun } from "../../api/types";

const WORDS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STEP = 15;
const FIRST = 6 * 60;
const LAST = 23 * 60 + 45;

const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};
const clock = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "south-east" for 135 degrees: the nearest of the eight directions. */
export function compassWord(azimuth: number): string {
  const turn = ((azimuth % 360) + 360) % 360;
  return WORDS[Math.round(turn / 45) % 8] as string;
}

/** "On 21 June at 13:00 the sun is in the south (180°), 74° high. Sunset at 21:05." */
export function sunSentence(date: string, time: string, sun: MapRoomSun | null): string {
  if (!sun) return "";
  const [, month, day] = date.split("-").map(Number);
  const when = `On ${day} ${MONTHS[(month ?? 1) - 1]} at ${time}`;
  if (sun.altitude <= 0) {
    const tail = sun.sunrise && minutesOf(time) < minutesOf(sun.sunrise) ? ` Sunrise is at ${sun.sunrise}.` : sun.sunset ? ` Sunset was at ${sun.sunset}.` : "";
    return `${when} the sun is below the horizon.${tail}`;
  }
  const where = `${when} the sun is in the ${compassWord(sun.azimuth)} (${Math.round(sun.azimuth)}°), ${Math.round(sun.altitude)}° high.`;
  return sun.sunset ? `${where} Sunset at ${sun.sunset}.` : where;
}

/** 06:00 to 23:45 in 15-minute steps, the same grid as the booking slots. */
export function lightSteps(): string[] {
  const steps: string[] = [];
  for (let minutes = FIRST; minutes <= LAST; minutes += STEP) steps.push(clock(minutes));
  return steps;
}

const onGrid = (time: string): string => clock(Math.min(LAST, Math.max(FIRST, Math.round(minutesOf(time) / STEP) * STEP)));

export interface Preset {
  name: string;
  time: string;
}

/** The shortcut buttons: sunrise and sunset (when known, on the slider's grid), lunch and dinner. */
export function presetTimes(sun: Pick<MapRoomSun, "sunrise" | "sunset"> | null): Preset[] {
  const presets: Preset[] = [];
  if (sun?.sunrise) presets.push({ name: "Sunrise", time: onGrid(sun.sunrise) });
  presets.push({ name: "Lunch 13:00", time: "13:00" });
  if (sun?.sunset) presets.push({ name: "Sunset", time: onGrid(sun.sunset) });
  presets.push({ name: "Dinner 20:30", time: "20:30" });
  return presets;
}

const clean = (value: number): number => Math.round(value * 1e10) / 1e10 + 0;

/**
 * Where the sun is on the plan, as a unit vector from the room to the sun
 * (x to the right, y down). The azimuth is a compass bearing; `north` is the
 * screen direction of true north, so the screen angle is their sum.
 */
export function sunDirection(azimuth: number, north: number): { x: number; y: number } {
  const turn = ((azimuth + north) * Math.PI) / 180;
  return { x: clean(Math.sin(turn)), y: clean(-Math.cos(turn)) };
}
