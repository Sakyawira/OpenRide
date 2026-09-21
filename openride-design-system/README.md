# OpenRide — Design System

The Flutter package `openride_design_system` owns the actual styled components used by the OpenRide apps, its logo, colour tokens and light/dark themes. `mockride/` is a separate React workspace package containing the actual shared MockRide components, CSS tokens and Storybook. It imports neither application controllers nor backend models.

Public components: `OpenRideLogo`, `OpenRideButton`, `OpenRideBadge`, `OpenRideNotice`, `OpenRideOfferCard`, and `OpenRideTripPanel`. Presentation data and callbacks keep business logic in the frontend.

## Component catalogue

[Widgetbook](https://pub.dev/packages/widgetbook) provides a Storybook-style Flutter catalogue. `catalog/` imports this package directly and exposes controls for labels, disabled and warning states, and trip states.

```sh
cd openride-design-system/catalog
flutter pub get
flutter run -d chrome --web-port=4200
```

Or build and serve it:

```sh
cd openride-design-system/catalog
flutter build web --no-web-resources-cdn
cd ../..
pnpm design:serve
```

Open http://127.0.0.1:4200. The **Dark mode** switch above the navigation changes the catalogue and the actual component previews together, without resetting the selected component or its controls. No paid account or cloud integration is needed.

## MockRide Storybook

```sh
# From the repository root
pnpm install
pnpm design:mockride
# Static build for eventual hosting
pnpm design:mockride:build
```

Open http://127.0.0.1:4201 and use the **Light theme / Dark theme** toolbar button. The React catalogue imports the same buttons, notices, badges, journey/offer cards, trip panel and Leaflet map used by both MockRide apps. Form styles and brand treatments are included in the style guide. Storybook fixtures do not call the booking backend. Static output goes to `mockride/dist/`.

## Appearance in the apps

OpenRide's sun/moon **Appearance** menu offers Light, Dark and Use device theme. It defaults to the device setting; a manual choice lasts for the current app session. Both Flutter apps use `OpenRideThemedApp`, and components read their surrounding `ThemeData` colour roles.

Both MockRide apps have an **Appearance** selector with the same three choices. They remember the preference in browser storage and share it across tabs on the same origin. Device theme follows operating-system changes. The shared CSS uses semantic variables for surfaces, text, borders, focus and notices.

Both brands preserve their accent colours in dark mode. Map tiles receive a dark tonal filter; pins, controls and attribution stay separate and readable. Theme changes do not reset ride forms, map pins or booking state.

## Reuse and eventual release

The app uses a local path dependency. Other repositories can pin a Git commit or release tag:

```yaml
dependencies:
  openride_design_system:
    git:
      url: git@github.com:Sakyawira/OpenRide.git
      ref: YOUR_COMMIT_OR_RELEASE_TAG
      path: openride-design-system
```

GitHub Packages does not provide a Dart/pub registry. Use Git dependencies initially, then pub.dev or a compatible private Dart registry. A GitHub Release can also carry a catalogue/asset bundle. The package remains `publish_to: none` until the public API and release destination are agreed. See [Dart dependency sources](https://dart.dev/tools/pub/dependencies) and [GitHub's supported registries](https://docs.github.com/en/packages/learn-github-packages/introduction-to-github-packages#supported-clients-and-formats).

Edit the SVG in `assets/brand/`; the original PNG reference is preserved there. Run `pnpm brand:generate` from the root to regenerate app icons. See [branding](../docs/branding.md).

`OpenRideJourneyCard` presents rider progress. `OpenRideMap` is a styled OpenStreetMap surface for stop selection or display; it accepts UI-only coordinates and callbacks. Widgetbook includes both components. The protocol and booking rules remain outside this package. See [map configuration](../docs/maps.md).
