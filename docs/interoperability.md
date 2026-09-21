# Four independent apps, one protocol

Each frontend is a top-level project. OpenRide's two Flutter applications share the Dart protocol client and Flutter design system. MockRide's two React applications share the TypeScript protocol client; they use their own UI. Both brands call the same versioned HTTP/JSON contract, and the backend can switch storage without changing them.

```sh
pnpm install
pnpm build:frontends
pnpm dev
```

Open http://127.0.0.1:4100/apps. The gallery launches each role in its own tab:

| Application     | Local URL           | Public fixture token   | Identity      |
| --------------- | ------------------- | ---------------------- | ------------- |
| OpenRide Rider  | `/rider/`           | `openride-demo-rider`  | `demo-rider`  |
| OpenRide Driver | `/`                 | `openride-demo-driver` | `demo-driver` |
| MockRide Rider  | `/mockride/rider/`  | `mockride-demo-rider`  | `mock-rider`  |
| MockRide Driver | `/mockride/driver/` | `mockride-demo-driver` | `mock-driver` |

## Try both directions

1. In OpenRide Rider, select pickup and destination pins on the map (or type both stops), get a quote, review the price and request the ride.
2. Find that route in MockRide Driver and accept it. OpenRide Rider changes to **Driver confirmed**.
3. Start and complete the trip in MockRide Driver. The rider sees **Arrived**, and the driver becomes available again.
4. Repeat with MockRide Rider and OpenRide Driver.

For pinned rides, the driver map shows the same pickup and destination coordinates. See [OpenStreetMap integration](maps.md) for scope and tile configuration.

The frontends never read each other's state or database. Rider requests atomically publish provider offers; driver bookings update provider reservations; rider snapshots derive progress from those reservations. Status updates are polled, so another tab may take a couple of seconds to update.

## Independent prices

The Harbour simulator represents OpenRide's demo service and is the OpenRide rider's default. Its `FlatFarePricing` returns NZD 19.90, with NZD 19.90 to the driver. The City simulator represents MockRide's demo service and is its rider's default. Its `MeteredDemoPricing` uses synthetic distance/time to quote NZD 16.50 with NZD 15.00 to the driver. Both clients can also select the other provider. Pricing follows the chosen service, regardless of which frontend displays it.

`RidePricing` is a backend interface. A provider can implement a different tariff without changing the protocol, coordinator, repositories or driver apps. The protocol carries fare, payout, currency and pricing version. Each request stores its reviewed terms; price changes cause a conflict before publication and do not modify existing journeys. These examples are simulations, not real route estimates or payments.

## Same driver across two apps

The default OpenRide and MockRide drivers are **different people**. They can each hold their own ride, but cannot both claim the same order. To demonstrate one person using multiple apps, open MockRide Driver's Connection settings and enter `openride-demo-driver`. Both driver clients now use the same authority and identity. Accepting in either reserves that driver across both, and competing accepts across providers cannot both succeed. Restore `mockride-demo-driver` to return to separate drivers.

Real deployments need verified account linking and authority discovery. Matching a display name does not link identities. This prototype does not coordinate independent authorities or nonparticipating commercial apps.

## Run and deploy independently

Use `pnpm mockride:rider` or `pnpm mockride:driver` for standalone Vite development on ports 5201/5202. Run either Flutter project with `flutter run`, its own platform targets and `--dart-define=OPENRIDE_URL=...` as needed. Connection settings also accept a remote API. Web deployments need their origin in the backend's `CORS_ORIGINS`.

The free Render blueprint hosts the API and embedded simulators with MongoDB. It does not build or deploy frontends. See [storage and hosting](storage-conformance.md). Phone browser testing works with `HOST=0.0.0.0 pnpm dev` on trusted Wi-Fi and the Mac's LAN address.

## What the checks establish

The conformance matrix runs both rider/driver directions, conflicting driver accepts, ownership/authentication boundaries, durable rider retries, cancellation/reoffering and pricing validation against PGlite, MongoDB and both mixed combinations. Pricing tests reject tampering and stale quotes and retain saved fares across restarts. Flutter widget tests cover mobile/desktop journeys and retry behavior. These are executable reference examples of interoperability; they do not certify a third-party provider implementation.
