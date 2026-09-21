# Architecture decisions

## Ownership

```text
openride-protocol/       Specification, OpenAPI, TypeScript contracts
openride-app-frontend/   Flutter app, API adapter, controllers, flows
openride-app-backend/    Coordinator, interfaces, infrastructure adapters
openride-design-system/  Styled Flutter components, assets, Widgetbook
```

Backend → protocol is a pnpm workspace dependency. Frontend → design system is a Dart path dependency. Protocol and design system do not import the apps. The Flutter API adapter currently maps the versioned JSON contract manually. Tooling, CI and cross-project documentation stay at the root.

## Few servers first

Recommendation: start a pilot with one small OpenRide coordinator deployment and a transactional server database. Participating providers expose their own endpoints. The two local simulator processes represent external providers, not two additional OpenRide production services. Avoid separate brokers, microservices and distributed storage until a measured need justifies them. PGlite is the local development adapter, not the production database recommendation.

Offer discovery, cached profiles, tutorial progress and noncritical updates are candidates for local-first replication or peer exchange. Booking ownership needs an atomic claim: two disconnected writers must not each confirm the same driver. A future distributed database must provide consensus-backed arbitration or a single fenced owner per driver. A last-writer-wins merge cannot undo two real rides already confirmed.

## Replaceable boundaries

- `BookingRepository`: atomic driver claims, serialized updates, durable pending commands, state and event committed together. Future adapters must preserve these guarantees across all writers; basic CRUD or eventual replication is insufficient.
- `ProviderAdapter`: offers and idempotent prepare/commit/action commands. A P2P transport must preserve authenticated identity, stable booking IDs, acknowledgements and uncertainty handling.
- `DriverAuthenticator`: transport-independent verified identity.
- `RecoveryScheduler`: reconciliation triggers only; pending commands live durably in the repository.
- `DemoOfferSeeder`: fixture capability outside the interoperable protocol.

`main.ts` selects current adapters. The coordinator imports no database or HTTP client implementation. The PGlite adapter uses transactions and database uniqueness; future server adapters need migrations, backups and explicit ownership/fencing. PostgreSQL documents its [transaction isolation and retry requirements](https://www.postgresql.org/docs/current/transaction-iso.html).

## P2P experiment

Measure connection success, latency, mobile battery use and relay bandwidth before making P2P the primary transport. WebRTC needs signalling and may need TURN relays when direct connections fail. See [peer connections](https://webrtc.org/getting-started/peer-connections) and [TURN guidance](https://webrtc.org/getting-started/turn-server). Peer traffic does not imply zero server cost.

Do not make an intermittently connected phone the sole booking authority without defining identity ownership, device migration, fencing, durable recovery and partition behavior. A disconnected participant must not confirm a booking from stale availability. Uncertain outcomes remain blocking.

These interfaces enable substitution. Consensus, replicated storage, P2P transport, automatic failover and offline booking are not implemented.

## Releases

The protocol builds to portable ESM and declarations, ready for a future GitHub Packages npm release. The design system has its own Flutter public API and catalogue; distribute it through Git first, then a Dart registry. Neither is automatically published by CI. Version the package APIs independently and pin external consumers.
