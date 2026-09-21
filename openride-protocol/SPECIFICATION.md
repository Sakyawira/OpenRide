# OpenRide Protocol — v0.1 draft

This is an experimental contract implemented by this repository. It is not an existing industry standard or an integration with commercial ride providers. Endpoint definitions and payload schemas are in [openapi.json](openapi.json). Regenerate them with `pnpm protocol:generate` after changing the contract.

## Participants and authority

- **Rider client:** reviews a provider quote, requests a ride and reads progress for its authenticated rider.
- **Driver client:** displays offers from participating providers and sends commands on behalf of its authenticated driver.
- **Driver coordinator:** the single authority for that driver's availability. All participating acceptance paths must reserve with this authority before confirming a ride.
- **Provider:** owns offers and assignments for its platform. It must enforce one assignment per order independently of the coordinator.

The local reference has one coordinator, two fixture drivers, two fixture riders and two independently stored providers. OpenRide and MockRide each have rider and driver clients. Public demo tokens map to server-owned identities; a client cannot supply another identity in a body. Both apps can use the same token to represent the same participant. Providers use a separate private fixture bearer token. These tokens are development credentials, not a federated identity design.

## Safety invariants

1. A driver has at most one active or unresolved booking at its authoritative coordinator.
2. A provider order has at most one non-cancelled assignment, including after completion.
3. The accepted offer version must match the terms shown to the driver. Payouts are integer minor units plus a three-letter currency code.
4. Booking identity and request identity remain stable across retries. A key reused with different provider/offer/version terms returns `IDEMPOTENCY_CONFLICT`.
5. A timeout does not establish failure. A potentially successful external command retains the driver claim until its outcome is known.
6. Booking changes and their coordinator events are committed in the same local transaction.

These guarantees apply only to participating paths with intact databases and one authoritative coordinator per driver. They cannot prevent a separate nonparticipating app from booking that person. Driver identity linking, authority discovery, migration and failover are future protocol work. Running two independent coordinators for the same driver violates the authority assumption.

## Acceptance flow

```mermaid
sequenceDiagram
  participant D as Driver app
  participant C as Coordinator
  participant P as Provider
  D->>C: Accept offer + version + idempotency key
  C->>C: Persist preparing booking; claim driver atomically
  C->>P: Prepare (booking ID, driver ID, offer, secret token)
  P->>P: Claim order and driver; persist prepared reservation
  P-->>C: Prepared acknowledgement
  C->>C: Persist decision to commit
  C->>P: Commit (same booking ID and token)
  P->>P: Persist confirmed assignment
  P-->>C: Confirmed acknowledgement
  C->>C: Persist confirmed booking and event
  C-->>D: Confirmed booking
```

Two simultaneous accepts contend on an atomic coordinator driver claim. The PGlite and MongoDB reference adapters implement this with partial unique indexes. The loser receives `409 DRIVER_BUSY`. A separate provider constraint arbitrates two drivers accepting the same order.

If any provider response is lost, the coordinator persists `resolving` and keeps the pending command. The worker retries every five seconds, including on restart. Manual reconciliation invokes the same operation. Providers return the saved result for repeated commands with the same booking identity and token.

Only the documented prepare rejections `OFFER_UNAVAILABLE`, `OFFER_EXPIRED` and `OFFER_VERSION_MISMATCH` prove that prepare did not reserve anything. Other errors, malformed responses, authentication failures, process failures and timeouts remain unresolved. A conforming provider must check an existing booking identity **before** rechecking offer expiry or availability, so a retried successful prepare cannot later appear rejected.

There is deliberately no automatic lease expiry in this draft. An unresolved prepare can block availability indefinitely while a participant is unreachable. Trading availability for safety avoids a timed-out process confirming a trip after its driver has been released. Time-bounded holds require fencing and a precisely specified expiry/commit protocol before they can be added safely.

## States and commands

| Coordinator state | Meaning                                                  | Driver command  |
| ----------------- | -------------------------------------------------------- | --------------- |
| `preparing`       | Driver claimed; prepare or commit pending                | Reconcile       |
| `resolving`       | External command outcome uncertain; driver still claimed | Reconcile       |
| `confirmed`       | Provider acknowledged assignment                         | Start or cancel |
| `in_progress`     | Provider acknowledged trip start                         | Complete        |
| `completed`       | Completion acknowledged; driver released                 | None            |
| `cancelled`       | Cancellation acknowledged; driver released               | None            |
| `rejected`        | Definitive prepare rejection; driver released            | None            |

Provider states are `prepared`, `confirmed`, `in_progress`, `completed`, and `cancelled`. Supported transitions are prepare → commit → start → complete, or cancel from confirmed. Repeating the command that reached the current state is idempotent. Invalid or stale commands cannot regress a later state. Starting, completing and cancelling are persisted as pending coordinator commands before contacting the provider.

The API may expose the last acknowledged state briefly while an action is pending. The server checks pending commands as well as public state; the state shown on the phone is never the authority for accepting another action. Cancellation during prepare or an in-progress trip is intentionally unsupported in this slice.

Completed orders stay consumed. Cancellation releases a provider's order and driver claims; the offer can reappear if it has not expired. A new acceptance attempt for that reoffered order needs a new request key. Retrying the original key always returns the original booking, including a terminal booking.

## HTTP conventions

- Version prefix: `/v0.1`; health reports `0.1.0-draft`.
- JSON requests and responses, UTF-8. Timestamps are UTC ISO 8601.
- Bearer authentication required on `/v0.1/*` and `/demo/*`. `/health` and Flutter static assets are public.
- `Idempotency-Key` required for driver acceptance and rider request creation; 1–100 ASCII letters, digits, hyphens or underscores. UUIDs are recommended. Reuse it after an interrupted response.
- HTTP 200 for a resolved acceptance (inspect `state`, including `rejected`); 202 while an acceptance remains pending. Reconcile/action endpoints return 200 with the current state, which may still be `resolving`.
- Errors use `{ "code": "DRIVER_BUSY", "message": "..." }`; 400 invalid input, 401 unauthenticated, 404 unknown resource/provider, 409 conflict, 502/503 dependency/service errors.
- No external provider URLs are accepted from drivers. The server uses configured registered providers.

### Driver endpoints

| Method | Path                            | Purpose                                                 |
| ------ | ------------------------------- | ------------------------------------------------------- |
| GET    | `/v0.1/snapshot`                | Active booking, available offers, provider availability |
| POST   | `/v0.1/bookings`                | Accept `{providerId, offerId, offerVersion}`            |
| GET    | `/v0.1/bookings/{id}`           | Read a booking owned by the authenticated driver        |
| POST   | `/v0.1/bookings/{id}/reconcile` | Retry its pending provider command                      |
| POST   | `/v0.1/bookings/{id}/actions`   | `{action: "start" \| "complete" \| "cancel"}`           |
| GET    | `/v0.1/events?after=0`          | Next page of up to 200 driver-scoped events             |

Snapshot offers are advisory and can become unavailable immediately. Acceptance always validates and reserves again. An unavailable provider is marked `available: false` and contributes no offers; other providers and an existing booking remain visible. The reference UI polls snapshots every two seconds.

### Rider endpoints and service-owned pricing

| Method | Path                                     | Purpose                                                         |
| ------ | ---------------------------------------- | --------------------------------------------------------------- |
| POST   | `/v0.1/rider/quotes`                     | Quote `{providerId, pickup, destination}`                       |
| POST   | `/v0.1/rider/requests`                   | Submit that route with `expectedPrice` and an `Idempotency-Key` |
| GET    | `/v0.1/rider/snapshot`                   | Owned requests and provider availability                        |
| GET    | `/v0.1/rider/requests/{providerId}/{id}` | Read one owned request                                          |

Each service supplies its own pricing policy. The protocol defines monetary terms, not a common tariff. A quote contains `fareMinor` (rider charge), `payoutMinor` (driver earnings), `currency` and `pricingVersion`. Amounts are integer minor units. Services may use flat fares, metered formulas, promotions or negotiated prices behind the pricing interface. The reference's metrics and prices are synthetic; no payment is taken.

The rider clients first display the provider's quote, then submit it as `expectedPrice`. The provider recalculates and compares all terms before creating a request. A changed or modified price returns `409 PRICE_CHANGED` and requires another review. Quotes are advisory until submitted and do not hold availability. Draft compatibility permits omitting `expectedPrice`, which uses the provider's current price; both shipped rider UIs submit reviewed terms.

The provider atomically saves the fare, driver payout and discoverable offer. Later policy changes do not reprice that request. A retry with the same rider/key/route/pricing returns the saved request, even after a tariff update or restart. Reusing that key with different terms returns `IDEMPOTENCY_CONFLICT`. Request keys are scoped per rider and provider. Driver acceptance checks the persisted offer version and payout rather than recalculating the rider's fare.

Requests and offers may include `locations: {pickup: {latitude, longitude}, destination: {latitude, longitude}}` in WGS84 decimal degrees. Both points are required when present; latitude and longitude are range-checked. The provider retains these coordinates unchanged, includes them in request identity comparisons and exposes them to the accepted driver. Map rendering and tile providers are frontend concerns.

Rider progress is derived from the provider's persisted assignment: `searching`, `matching`, `confirmed`, `in_progress`, `completed`, or `expired`. Cancelling a confirmed driver booking makes the request searchable again while unexpired. Rider-initiated cancellation, refunds and changing an active journey's fare are future work. Reads check ownership; driver credentials cannot call rider endpoints or vice versa. Clients poll every two seconds. No direct frontend-to-frontend connection is required.

### Provider endpoints

| Method | Path                                    | Purpose                                                                          |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------- |
| POST   | `/v0.1/ride-quotes`                     | Quote a route using the provider's policy                                        |
| POST   | `/v0.1/rider-requests`                  | Create a request and offer with verified rider ID, replay key and expected price |
| GET    | `/v0.1/rider-requests?riderId=...`      | List that rider's requests                                                       |
| GET    | `/v0.1/rider-requests/{id}?riderId=...` | Read an owned request                                                            |
| GET    | `/v0.1/offers`                          | List unexpired, unassigned offers                                                |
| GET    | `/v0.1/offers/{id}`                     | Read exact versioned offer terms                                                 |
| POST   | `/v0.1/reservations`                    | Prepare `{bookingId, driverId, offerId, offerVersion, token}`                    |
| POST   | `/v0.1/reservations/{id}/actions`       | Apply `{token, action: "commit" \| "start" \| "complete" \| "cancel"}`           |

The secret reservation token is generated by the coordinator and is never included in driver responses. Provider booking ID, driver ID, offer ID/version and token must match when replaying prepare. Production transport must use authenticated TLS, proper provider identity, scoped credentials and replay protection.

`POST /demo/offers` on either server is a reference-only fixture endpoint, not part of the proposed interoperable protocol. It adds synthetic orders; it must not reset reservations. Provider seed runs automatically only for a new empty database.

## Events, queues and subscriptions

Each coordinator event has `sequence`, `type`, `bookingId`, `bookingVersion`, and `occurredAt`. The sequence is a durable global database cursor; driver-scoped readers may see gaps. Fetch subsequent pages using the last received sequence. Sequence allocations can also have gaps after transaction rollback. Booking versions order changes within a booking.

The current implementation has a durable **event log**, no distributed event bus. Persisted `pendingAction` is a recoverable command work queue. The worker polls it and retries idempotently. An “event head” can be represented by the subscriber's last processed sequence; the server does not store subscriptions or acknowledgements yet. Consumers should deduplicate by sequence, checkpoint only after processing and recover current booking state by ID when needed. The same event type can occur at multiple booking versions, including when commit intent is recorded.

A future tutorial engine can translate app interactions and booking events into modal steps. Tutorial subscribers must be separate from reservation enforcement. A tutorial being dismissed, paused or replayed must never start, cancel or complete a real trip by itself.

## Reference implementation boundaries

The reference supports PGlite and MongoDB behind the same repository interfaces. The conformance suite exercises both and both mixed coordinator/provider combinations, including real database rollback and HTTP interoperability. MongoDB requires a replica set for transactional booking/event writes; multiple clients can share the same authoritative database. This does not provide coordination between independent databases. See [storage conformance](../docs/storage-conformance.md).

PGlite is used in single-process, persistent-directory mode. One process owns each participant's database. The demo is not horizontally scalable, has no cross-host consensus and does not implement database migrations beyond initial table creation. Its tests cover concurrent requests, provider order arbitration, duplicate keys, lost acknowledgements and reopening persisted coordinator state. They do not establish production fault tolerance under disk loss, partitions with split authority, malicious providers or arbitrary database corruption.

Before a production pilot: define federated driver identity and coordinator ownership/fencing; migrate to a managed server database with migrations/backups; add real authentication, TLS, rate limits, provider conformance tests and dispute/repair operations; specify pricing, location privacy, cancellations, payments and safety workflows. Commercial integrations require actual agreements and provider-side participation.
