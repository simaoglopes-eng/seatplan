// Tab-local search context only. No booking links, customer details or API answers are stored.
import type { FeatureKey } from "../../api/discovery";
import { CUISINES } from "../../api/owner";

export interface DiscoveryState { text: string; cuisines: string[]; prices: number[]; features: FeatureKey[]; date: string; time: string; party: string; availableOnly: boolean; view: "list" | "map"; scroll: number; pages: number }
const KEY = "seatplan.discover.context.v3";
const EMPTY: DiscoveryState = {text:"", cuisines:[], prices:[], features:[], date:"", time:"", party:"2", availableOnly:true, view:"list", scroll:0, pages:1};
export function loadDiscoveryState(): DiscoveryState {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<DiscoveryState> | null;
    if (!value || typeof value !== "object") return EMPTY;
    return {
      text: typeof value.text === "string" ? value.text.slice(0,80) : "",
      cuisines: Array.isArray(value.cuisines) ? value.cuisines.filter(c => CUISINES.some(known => known === c)) : [],
      prices: Array.isArray(value.prices) ? value.prices.filter(p => [1,2,3,4].includes(p)) : [],
      features: Array.isArray(value.features) ? value.features.filter(f => ["sun","view","accessible","terrace"].includes(f)) : [],
      date: typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : "",
      time: typeof value.time === "string" && /^\d{2}:\d{2}$/.test(value.time) ? value.time : "",
      party: typeof value.party === "string" && /^(10|[1-9])$/.test(value.party) ? value.party : "2",
      availableOnly: value.availableOnly !== false, view: value.view === "map" ? "map" : "list",
      scroll: typeof value.scroll === "number" && Number.isFinite(value.scroll) ? Math.max(0,value.scroll) : 0,
      pages: typeof value.pages === "number" && Number.isInteger(value.pages) ? Math.min(25,Math.max(1,value.pages)) : 1,
    };
  } catch { return EMPTY; }
}
export function saveDiscoveryState(value: DiscoveryState): void {
  try { sessionStorage.setItem(KEY,JSON.stringify(value)); } catch { /* Browsing without storage still works. */ }
}

