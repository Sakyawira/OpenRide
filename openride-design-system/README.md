# OpenRide — Design System

The Flutter package `openride_design_system` owns the actual styled components used by the app, its logo, colour tokens and theme. It imports neither application controllers nor backend models.

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

Open http://127.0.0.1:4200. No paid account or cloud integration is needed.

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
