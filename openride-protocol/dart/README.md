# OpenRide Dart client

Pure Dart HTTP client and wire models for the rider and driver endpoints. Both Flutter frontends depend on this package. It has no Flutter, UI or database dependency.

```dart
import 'package:openride_protocol/openride_protocol.dart';

final api = OpenRideApi(
  baseUrl: 'http://127.0.0.1:4100',
  token: 'openride-demo-rider',
);
final journeys = await api.riderSnapshot();
api.close();
```

Run `dart pub get` and `dart analyze` here. App tests exercise serialization and retries through injected HTTP clients. Models map the wire contract manually; the specification and OpenAPI remain authoritative. This package is not published yet.
