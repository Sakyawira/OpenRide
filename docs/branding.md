# OpenRide branding

The app palette comes from the repository's original [logo PNG](../openride-design-system/assets/brand/logo.png). That reference artwork is preserved. [openride-design-system/assets/brand/logo.svg](../openride-design-system/assets/brand/logo.svg) is now a hand-redrawn, resolution-independent interpretation of the same mark; the previous SVG contained embedded raster images.

| Colour    | Hex       | Use                                     |
| --------- | --------- | --------------------------------------- |
| Navy      | `#19425E` | Logo outline, headings, primary buttons |
| Deep navy | `#0C2E4A` | Active-trip panel                       |
| Aqua      | `#80FAF5` | Highlights and buttons on navy          |
| Cyan      | `#A3FCFC` | Logo gradient                           |
| Pale cyan | `#CFFFFF` | Badges, notices, selected controls      |

Text uses navy on light surfaces, white on navy, or navy on aqua. Warning colours remain distinct from the brand palette. Shared Flutter colour tokens and the logo widget live in `openride-design-system/lib/src/branding.dart`.

## Update the logo

Edit `openride-design-system/assets/brand/logo.svg`, then run:

```sh
pnpm brand:generate
```

Flutter bundles the SVG from the design-system package. The generator copies it into web assets, exports and validates PNG dimensions, and refreshes:

- Web favicon, install icons, and maskable icons.
- macOS and iOS app icon catalogs.
- iOS launch images.
- Android legacy/adaptive launcher assets and launch images.

Maskable/adaptive exports include extra safe-area padding. The web loading screen uses the SVG directly; Flutter renders it with [flutter_svg](https://pub.dev/packages/flutter_svg). PNG exports use [Sharp](https://sharp.pixelplumbing.com/api-constructor/). Rebuild the Flutter web app after generating assets. Native icon/splash configuration still needs device verification once Xcode/Android SDK are installed.

The redraw is about 3 KB with real paths and gradients, compared with roughly 1.4 MB for the original raster-embedded SVG. SVG is the production source; an ASCII version can be added separately for terminal output if needed.
