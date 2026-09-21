import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { GeoPoint } from '@sakyawira/openride-protocol';
import 'leaflet/dist/leaflet.css';

interface MapViewProps {
  pickup?: GeoPoint;
  destination?: GeoPoint;
  onSelect?(point: GeoPoint): void;
}
const TILE_URL =
  import.meta.env.VITE_OSM_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function MapView({ pickup, destination, onSelect }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | undefined>(undefined);
  const markers = useRef<L.LayerGroup | undefined>(undefined);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView(
      [-36.8485, 174.7633],
      13
    );
    map.current = instance;
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      keepBuffer: 0,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
      .on('tileerror', () => setUnavailable(true))
      .addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) =>
      select.current?.({
        latitude: Math.max(-90, Math.min(90, event.latlng.lat)),
        longitude: ((((event.latlng.lng + 180) % 360) + 360) % 360) - 180,
      })
    );
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = undefined;
    };
  }, []);
  useEffect(() => {
    const group = markers.current;
    if (!group) return;
    group.clearLayers();
    const points: L.LatLngTuple[] = [];
    for (const [point, label] of [
      [pickup, 'P'],
      [destination, 'D'],
    ] as const) {
      if (!point) continue;
      const position: L.LatLngTuple = [point.latitude, point.longitude];
      points.push(position);
      L.marker(position, {
        icon: L.divIcon({ className: `map-pin pin-${label}`, html: label, iconSize: [32, 32] }),
        title: label === 'P' ? 'Pickup' : 'Destination',
      }).addTo(group);
    }
    if (!select.current && points.length)
      map.current?.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: 15 });
  }, [pickup?.latitude, pickup?.longitude, destination?.latitude, destination?.longitude]);
  return (
    <div className="map-wrap">
      <div
        ref={container}
        className="ride-map"
        aria-label={
          onSelect ? 'Select pickup and destination on the map' : 'Pickup and destination map'
        }
      />
      <p className="map-caption">P · Pickup &nbsp; D · Destination</p>
      {unavailable && (
        <p className="map-caption">Map tiles are unavailable. You can still enter your stops.</p>
      )}
    </div>
  );
}
