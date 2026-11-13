import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./maps.css";

export interface MapPoint { lat: number; lng: number }
export default function LeafletMap({ point, onChange }: { point: MapPoint | null; onChange: (point: MapPoint) => void }) {
  const host = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), marker = useRef<L.Marker | null>(null);
  const change = useRef(onChange), current = useRef(point);
  change.current = onChange; current.current = point;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const view = L.map(host.current!, { scrollWheelZoom: false }).setView(current.current ?? { lat: 38.7223, lng: -9.1393 }, 13);
    map.current = view;
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, referrerPolicy: "strict-origin-when-cross-origin",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(view);
    tiles.on("tileerror", () => setFailed(true));
    view.on("click", (event: L.LeafletMouseEvent) => change.current({ lat: event.latlng.lat, lng: event.latlng.lng }));
    return () => { view.remove(); map.current = null; marker.current = null; };
  }, []);
  useEffect(() => {
    const view = map.current;
    if (!view) return;
    if (!point) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      marker.current = L.marker(point, { draggable: true, title: "Restaurant location", alt: "Restaurant pin", icon: L.divIcon({ className: "owner-map-pin", html: '<span aria-hidden="true">●</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(view);
      marker.current.on("dragend", () => { const next = marker.current!.getLatLng(); change.current({ lat: next.lat, lng: next.lng }); });
    } else marker.current.setLatLng(point);
    if (!view.getBounds().contains(point)) view.panTo(point);
  }, [point?.lat, point?.lng]);
  return <><div ref={host} className="owner-location-map" role="region" aria-label="Restaurant location map" />{failed && <p role="status">Map tiles are unavailable. You can still enter latitude and longitude below.</p>}</>;
}
