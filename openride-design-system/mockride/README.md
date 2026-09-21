# MockRide design system

Shared React components and light/dark CSS used by both independent MockRide apps. This is an internal workspace package under `openride-design-system`, not another frontend and not part of the protocol.

- `pnpm design:mockride` (repository root): Storybook at http://127.0.0.1:4201.
- `pnpm design:mockride:build`: static catalogue in `dist/`.
- `pnpm --filter @sakyawira/mockride-design-system check`: TypeScript, ESLint and formatting.

Import components from `@sakyawira/mockride-design-system` and the stylesheet from `@sakyawira/mockride-design-system/styles.css`. Apps call `initializeMockRideTheme()` before mounting and render `ThemeToggle` in their header. Storybook's theme toolbar controls its own preview and shell without changing the app preference.

Presentation props and callbacks keep pricing, authentication and booking logic in the apps. The map accepts plain latitude/longitude values. Keep additions shared here so rider, driver and catalogue stay consistent.
