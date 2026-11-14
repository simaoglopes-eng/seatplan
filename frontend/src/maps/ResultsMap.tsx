// The map of search results: one pin per restaurant, the highlighted one
// drawn larger. Like LeafletMap it creates the Leaflet map in an effect and
// removes it on unmount; there is no react-leaflet. Pins are real buttons
// (Leaflet keyboard support), and the list next to the map is the accessible
// way to reach every restaurant, so the map itself adds nothing a keyboard needs.
import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SchematicMap } from "./SchematicMap";
import "./maps.css";

export interface ResultPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface Props {
  pins: ResultPin[];
  highlightedId: string | null;
  onSelect: (id: string) => void;
  /** Where the diner searched from, shown as a small dot. */
  center?: { lat: number; lng: number } | null;
  /** Tells the page when the tiles failed and a numbered diagram took the map's place, so cards can show the same numbers. */
  onFallback?: (active: boolean) => void;
}

// If no tile has loaded after this long (or the browser is offline), the map is replaced by a diagram.
const TILE_PATIENCE_MS = 6000;

const LISBON = { lat: 38.7223, lng: -9.1393 };

export default function ResultsMap({ pins, highlightedId, onSelect, center, onFallback }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const select = useRef(onSelect);
  select.current = onSelect;
  const [failed, setFailed] = useState(false);
  const [fallback, setFallback] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  const tell = useRef(onFallback);
  tell.current = onFallback;
  useEffect(() => tell.current?.(fallback), [fallback]);

  useEffect(() => {
    if (!host.current) return;
    const view = L.map(host.current, { scrollWheelZoom: false }).setView(LISBON, 11);
    map.current = view;
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      referrerPolicy: "strict-origin-when-cross-origin",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(view);
    let loaded = 0;
    tiles.on("tileload", () => {
      loaded += 1;
      setFallback(false);
      setFailed(false);
    });
    tiles.on("tileerror", () => setFailed(true));
    // No tile after a while: show the diagram instead of a grey box. A tile that arrives later brings the map back.
    const patience = window.setTimeout(() => {
      if (loaded === 0) setFallback(true);
    }, TILE_PATIENCE_MS);
    const pinsOnMap = markers.current;
    return () => {
      window.clearTimeout(patience);
      // A pan or zoom still animating when the map is removed throws inside Leaflet.
      view.stop();
      view.remove();
      map.current = null;
      pinsOnMap.clear();
    };
  }, []);

  // Draw the pins again when the results change, and show them all.
  useEffect(() => {
    const view = map.current;
    if (!view) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current.clear();
    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng], {
        title: pin.name,
        alt: `${pin.name} on the map`,
        icon: L.divIcon({ className: "discover-pin", html: '<span aria-hidden="true"></span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      }).addTo(view);
      marker.on("click", () => select.current(pin.id));
      markers.current.set(pin.id, marker);
    }
    const points: L.LatLngExpression[] = pins.map((pin) => [pin.lat, pin.lng]);
    if (center) points.push([center.lat, center.lng]);
    if (points.length > 1) view.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15, animate: false });
    else if (points.length === 1) view.setView(points[0], 14, { animate: false });
  }, [pins, center?.lat, center?.lng]);

  // The pin of the hovered card gets a bigger, darker look.
  useEffect(() => {
    markers.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle("discover-pin-active", id === highlightedId);
      marker.setZIndexOffset(id === highlightedId ? 1000 : 0);
    });
  }, [highlightedId, pins]);

  return (
    <>
      {/* The Leaflet map stays mounted (hidden) while the diagram is shown, so it can recover if tiles arrive. */}
      <div ref={host} className="discover-map" role="region" aria-label="Map of the restaurants found" hidden={fallback} />
      {fallback && <SchematicMap pins={pins} highlightedId={highlightedId} onSelect={onSelect} centre={center} />}
      {failed && !fallback && <p role="status">Map tiles are loading slowly. The list shows every restaurant.</p>}
    </>
  );
}
