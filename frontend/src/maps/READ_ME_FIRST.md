# Location maps

LeafletMap loads only when a location form opens. Leaflet is pinned to 1.9.4.
It uses the standard HTTPS OpenStreetMap tile URL with visible attribution.
There is no address lookup, geocoding, bulk downloading or server-side proxy.
Tiles follow normal browser caching and override the page referrer policy
with strict-origin-when-cross-origin, sending only the site origin to OSM.

The map starts in Lisbon at zoom 13. Clicking places a draggable div-icon pin.
The controlled point and coordinate fields stay in sync. Without tiles, fields
still work. Geolocation belongs to the form and is requested only on a click.
The map cleans up its Leaflet instance on unmount. Numeric fields provide the
keyboard alternative to clicking/dragging. No device location is requested by
this component.

Sources: https://leafletjs.com/reference-1.9.4.html and
https://operations.osmfoundation.org/policies/tiles/ . The actual hosted
Referer/CSP behavior still needs a deployment check; no deployment is authorized.
