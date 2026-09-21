# OpenRide — Protocol

Independent, versioned ride-booking contracts. This folder owns the [specification](SPECIFICATION.md), [OpenAPI document](openapi.json), and TypeScript/Zod package `@sakyawira/openride-protocol`. It has no dependency on the apps, database, HTTP server or design system.

From the repository root:

```sh
pnpm build:protocol
pnpm protocol:generate
pnpm --dir openride-protocol pack --out /tmp/openride-protocol.tgz
```

The package exports compiled ESM, TypeScript declarations and `@sakyawira/openride-protocol/openapi.json`. Its publish configuration targets GitHub's npm registry for a future authenticated release. Nothing is published automatically. The wire contract is language independent. The optional `@sakyawira/openride-protocol/client` export provides a fetch-based TypeScript client, used by both React apps. The [Dart package](dart/README.md) contains a manually maintained HTTP client and wire models, used by both Flutter apps. Neither client knows about database adapters, UI components or frontend folders. Code generation for Dart is future work.
