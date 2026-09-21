# OpenRide — App Backend

Reference booking coordinator and simulated providers. Start from the repository root with `pnpm dev`.

| Boundary                         | Interface           | Current adapter                          |
| -------------------------------- | ------------------- | ---------------------------------------- |
| Persistence and atomic event log | BookingRepository   | BookingStore / PGlite, MongoBookingStore |
| Provider persistence             | ProviderRepository  | PgliteProviderStore, MongoProviderStore  |
| Provider communication           | ProviderAdapter     | HttpProvider / HTTP JSON                 |
| Driver identity                  | DriverAuthenticator | StaticBearerAuthenticator fixture        |
| Recovery scheduling              | RecoveryScheduler   | IntervalRecoveryScheduler                |
| Demo order generation            | DemoOfferSeeder     | Local provider simulators                |

`Coordinator` depends on interfaces and protocol types. `main.ts` selects concrete adapters. Fastify translates HTTP commands into coordinator calls and gets identity from the injected authenticator.

Replacing storage requires atomic driver claims and serialized changes, with state and events committed together. Replacing transport must preserve idempotent acknowledgements and uncertainty handling. Eventual consistency alone cannot prevent double booking. See [architecture decisions](../docs/architecture.md).

Each simulated provider has its own PGlite database or MongoDB collection namespace. Real providers implement the protocol against their own dispatch and storage systems.

See [database conformance and free Render setup](../docs/storage-conformance.md). `pnpm test:conformance` exercises both database adapters and both mixed combinations using a real MongoDB replica set.
