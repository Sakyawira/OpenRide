# OpenStreetMap integration

All four frontends display OpenStreetMap raster tiles. OpenRide uses the reusable `OpenRideMap` Flutter component in `openride-design-system`, powered by flutter_map. Each independent MockRide app uses a small Leaflet adapter. Map libraries stay outside the protocol and backend.

Riders select **pickup** and **destination** by tapping the map. Both pins are required when using map selection; clearing them permits text-only stops. A changed pin invalidates the displayed quote. Driver maps display the accepted ride's coordinates and fit the two stops. Map pins are manually chosen, not the device's GPS position.

The optional protocol field is:

```json
{
  "locations": {
    "pickup": { "latitude": -36.844, "longitude": 174.768 },
    "destination": { "latitude": -36.869, "longitude": 174.778 }
  }
}
```

Coordinates use WGS84 decimal degrees, with latitude in [-90, 90] and longitude in [-180, 180]. Both points are required if `locations` is present. Quotes, rider requests and driver offers preserve the field. Changing a pin while reusing a saved request key is an idempotency conflict. Database adapters persist the same JSON contract; existing text-only offers remain valid.

## Tiles and attribution

The default source is `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Visible attribution links to OpenStreetMap copyright. Flutter native requests identify the app and use flutter_map's built-in HTTP-aware cache; browsers use their normal tile cache and Referer. Loading is limited to the viewed map; there is no bulk-download or offline-area feature. Widget tests disable network tiles with `OpenRideMapScope`.

These choices follow the [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/) and [flutter_map caching guidance](https://docs.fleaflet.dev/layers/tile-layer/caching). The public tile service has limited capacity and no availability guarantee. Use a suitable hosted OSM tile provider or self-hosting if usage grows.

Tile templates are build-time configurable with Flutter `--dart-define=OSM_TILE_URL=...` or React `VITE_OSM_TILE_URL`. Keep any additional attribution required by your chosen provider. The default URL uses HTTPS. No API key is needed for this small demo.

## Current scope

This implements interactive maps, stop selection, coordinate validation and cross-app pin display. It does not include address search/geocoding, device location, road routing, navigation, driver tracking or real distance-based pricing. The two pricing policies still use their documented synthetic metrics. A routing/geocoding service is a separate replaceable integration, not a feature of the tile server. Map failures leave text entry and existing booking operations available.
