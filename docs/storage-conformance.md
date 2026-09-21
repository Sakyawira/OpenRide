# Database-independent reference implementation

The wire protocol lives in `openride-protocol`. Neither its JSON contract nor the coordinator/provider state machines import a database driver. Two storage implementations exercise the same behavior:

| Boundary             | PGlite                     | MongoDB                   |
| -------------------- | -------------------------- | ------------------------- |
| `BookingRepository`  | `store.ts`                 | `mongo-booking-store.ts`  |
| `ProviderRepository` | `pglite-provider-store.ts` | `mongo-provider-store.ts` |

`storage.ts` is the composition point. Set `STORAGE_ADAPTER=pglite` (default) or `STORAGE_ADAPTER=mongodb`. No frontend or protocol changes are required to switch. Existing PGlite directories remain compatible; switching adapters selects a different dataset and does not migrate data.

## MongoDB guarantees

- A partial unique index arbitrates one active/unresolved coordinator booking per driver. Another unique index protects driver/idempotency-key pairs.
- Booking changes, event writes and the durable sequence counter share one MongoDB transaction. Readers cannot advance past a lower cursor that has not committed yet.
- Provider indexes independently arbitrate one non-cancelled assignment per offer and one active reservation per driver. Completed orders remain consumed; cancelled orders can be offered again.
- Transaction callbacks are pure and may run again on write conflicts. Provider HTTP requests are outside database transactions.
- Delayed acknowledgements cannot overwrite a newer booking version, including when two workers share one authoritative database.
- Use a replica set, including MongoDB Atlas or a local single-node replica set. Standalone MongoDB is rejected at startup because it cannot provide the required multi-document transactions. There is no non-transactional fallback.

This proves adapter conformance for the tested cases, not universal protocol correctness or independent implementations by different vendors. PGlite permits one owning process per directory. MongoDB tests include independent connections to the same authority; separate databases still represent separate authorities and cannot coordinate the same driver.

## Run the same tests against both databases

```sh
pnpm test                  # PGlite, no MongoDB installation needed
pnpm test:conformance      # launches an isolated local mongod replica set
MONGODB_TEST_MODE=docker pnpm test:conformance
```

`mongod` must be installed for the default conformance command; alternatively use Docker. The runner chooses a free loopback port, creates a disposable data directory, initializes its own replica set, and shuts it down after testing. It does not alter an existing MongoDB service.

An existing test replica set can be supplied using `TEST_MONGODB_URI`. Each test creates and drops only its own randomly named `openride_test_*` database. Never point this test command at a production database account.

The suite runs PGlite/PGlite, MongoDB/MongoDB and both mixed coordinator/provider combinations. It covers racing accepts, replay keys, lost acknowledgements, restart recovery on both sides, HTTP interoperability, order ownership, cancellation, stale replies, event pagination, concurrent mutations, and real transaction rollback when event persistence fails. CI runs the same suite against a real `mongo:8.2` replica set.

## One free Render service

`render.yaml` defines a toy API using the free plan. Supply a MongoDB replica-set URI (for example, an Atlas free cluster) through Render's secret environment settings. The application uses the database named by `MONGODB_DATABASE`; its account needs collection/index creation and read/write access there. Permit the Render service to reach that cluster in the cluster's network configuration.

The hosted command runs the coordinator and two simulated providers in one process. Providers listen only on dynamically assigned loopback ports and are still called through the same HTTP protocol adapter. MongoDB holds their separate collections and all coordinator state. There is no local database dependency on Render's ephemeral filesystem.

```sh
STORAGE_ADAPTER=mongodb MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=openride' pnpm demo:hosted
```

Free Render can sleep and cold-start; that is acceptable for this proof of concept. Pending commands are recovered when the service wakes, and an uncertain booking remains reserved while it sleeps. Open the API's `/health` URL to wake it before a demo. Use **New demo offers** after the original synthetic offers expire.

The API does not build Flutter on Render. Run the Flutter clients locally against its HTTPS URL using `--dart-define=OPENRIDE_URL=https://YOUR_SERVICE.onrender.com`, or deploy their web builds separately. Set `CORS_ORIGINS` to the exact comma-separated web origins allowed to call the API. Native clients do not need CORS. All app instances share the public fixture driver: this is an intentionally public simulation with synthetic data, no real dispatch or payments.

The blueprint is deployable configuration, not evidence of a live deployment. A Render service and MongoDB connection must still be configured by the repository owner.

References: [MongoDB transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/), [partial indexes](https://www.mongodb.com/docs/manual/core/index-partial/), [Render free services](https://render.com/docs/free).
