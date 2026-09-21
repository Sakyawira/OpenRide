# MockRide — Driver frontend

Independent React + Vite example implementing the OpenRide driver contract. This project has its own package, entry point and build. Its UI is deliberately distinct from the Flutter reference. The shared dependency is `@sakyawira/openride-protocol/client`; it imports no code from another frontend or the backend.

From the repository root:

```sh
pnpm install
pnpm mockride:driver
```

Start `pnpm dev` in another terminal for the API. Vite proxies `/v0.1` to localhost:4100 and serves this app on port 5202. Use `VITE_OPENRIDE_URL=https://YOUR_API` for a separate backend (configure its CORS), or edit Connection settings. The default token is `mockride-demo-driver`.

```sh
pnpm --filter @sakyawira/mockride-driver check
pnpm --filter @sakyawira/mockride-driver build
```

The built app is served at `/mockride/driver/` by the local coordinator. The link to the other MockRide role expects the combined demo server; standalone deployments can set their own navigation. See the [interoperability walkthrough](../docs/interoperability.md).
