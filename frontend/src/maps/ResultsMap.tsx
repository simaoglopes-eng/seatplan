// The map of search results: one pin per restaurant, the highlighted one
// drawn larger. Like LeafletMap it creates the Leaflet map in an effect and
// removes it on unmount; there is no react-leaflet. Pins are real buttons
// (Leaflet keyboard support), and the list next to the map is the accessible
// way to reach every restaurant, so the map itself adds nothing a keyboard needs.
import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
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
}

const LISBON = { lat: 38.7223, lng: -9.1393 };

export default function ResultsMap({ pins, highlightedId, onSelect, center }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const select = useRef(onSelect);
  select.current = onSelect;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const view = L.map(host.current, { scrollWheelZoom: false }).setView(LISBON, 11);
    map.current = view;
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      referrerPolicy: "strict-origin-when-cross-origin",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(view);
    tiles.on("tileerror", () => setFailed(true));
    const pinsOnMap = markers.current;
    return () => {
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
      <div ref={host} className="discover-map" role="region" aria-label="Map of the restaurants found" />
      {failed && <p role="status">Map tiles are unavailable. The list shows every restaurant.</p>}
    </>
  );
}
