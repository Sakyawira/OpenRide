# OpenRide — Protocol

Independent, versioned ride-booking contracts. This folder owns the [specification](SPECIFICATION.md), [OpenAPI document](openapi.json), and TypeScript/Zod package `@sakyawira/openride-protocol`. It has no dependency on the apps, database, HTTP server or design system.

From the repository root:

```sh
pnpm build:protocol
pnpm protocol:generate
pnpm --dir openride-protocol pack --out /tmp/openride-protocol.tgz
```

The package exports compiled ESM, TypeScript declarations and `@sakyawira/openride-protocol/openapi.json`. Its publish configuration targets GitHub's npm registry for a future authenticated release. Nothing is published automatically. The wire contract is language independent; Flutter currently maps JSON in its own adapter. A generated Dart SDK is future work.
