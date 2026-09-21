import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:openride_design_system/openride_design_system.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:openride_protocol/openride_protocol.dart';
import 'package:openride/driver_controller.dart';
import 'package:openride/main.dart';

final offerJson = <String, dynamic>{
  'id': 'offer-one',
  'providerId': 'harbour',
  'providerName': 'Harbour Cooperative',
  'version': 1,
  'pickup': 'Britomart',
  'destination': 'Ponsonby Central',
  'payoutMinor': 1860,
  'currency': 'NZD',
  'pickupMinutes': 4,
  'tripMinutes': 14,
  'distanceKm': 4.2,
  'expiresAt': '2099-01-01T00:00:00.000Z',
};
Json booking(String state) => {
  'id': 'booking-one',
  'state': state,
  'offer': offerJson,
  'lastError': null,
};
Json snapshot([String? state]) => {
  'offers': [offerJson],
  'providers': [
    {'id': 'harbour', 'name': 'Harbour Cooperative', 'available': true},
  ],
  'activeBooking': state == null ? null : booking(state),
};

void main() {
  test('accepting an offer after cancelling uses a new request key', () async {
    final keys = <String?>[];
    String? state;
    final client = MockClient((request) async {
      if (request.url.path == '/v0.1/bookings') {
        keys.add(request.headers['idempotency-key']);
        state = 'confirmed';
        return http.Response(jsonEncode(booking(state!)), 200);
      }
      if (request.method == 'POST') {
        state = null;
        return http.Response(jsonEncode(booking('cancelled')), 200);
      }
      return http.Response(jsonEncode(snapshot(state)), 200);
    });
    final controller = DriverController(
      OpenRideApi(
        baseUrl: 'http://localhost:4100',
        token: 'test',
        client: client,
      ),
    );
    addTearDown(controller.dispose);
    await controller.refresh();
    await controller.accept(Offer.fromJson(offerJson));
    await controller.action(controller.snapshot!.activeBooking!, 'cancel');
    await controller.accept(Offer.fromJson(offerJson));
    expect(keys.length, 2);
    expect(keys[0], isNot(keys[1]));
  });

  test(
    'an interrupted accept retries with the same key and exact offer version',
    () async {
      final keys = <String?>[];
      final client = MockClient((request) async {
        if (request.method == 'POST') {
          keys.add(request.headers['idempotency-key']);
          expect(jsonDecode(request.body), {
            'providerId': 'harbour',
            'offerId': 'offer-one',
            'offerVersion': 1,
          });
          if (keys.length == 1) throw http.ClientException('Response lost');
          return http.Response(jsonEncode(booking('confirmed')), 200);
        }
        return http.Response(jsonEncode(snapshot()), 200);
      });
      final controller = DriverController(
        OpenRideApi(
          baseUrl: 'http://localhost:4100',
          token: 'test',
          client: client,
        ),
      );
      addTearDown(controller.dispose);
      await controller.refresh();
      await controller.accept(Offer.fromJson(offerJson));
      expect(controller.notice, contains('interrupted'));
      await controller.accept(Offer.fromJson(offerJson));
      expect(keys.length, 2);
      expect(keys[0], isNotEmpty);
      expect(keys[0], keys[1]);
    },
  );

  for (final width in [390.0, 1280.0]) {
    testWidgets(
      'driver can accept, start and complete a ride at width $width',
      (tester) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        String? state;
        final client = MockClient((request) async {
          if (request.url.path == '/v0.1/snapshot') {
            return http.Response(jsonEncode(snapshot(state)), 200);
          }
          if (request.url.path == '/v0.1/bookings') {
            state = 'confirmed';
            return http.Response(jsonEncode(booking(state!)), 200);
          }
          final action = (jsonDecode(request.body) as Json)['action'];
          state = action == 'start' ? 'in_progress' : null;
          return http.Response(jsonEncode(booking(state ?? 'completed')), 200);
        });
        final controller = DriverController(
          OpenRideApi(
            baseUrl: 'http://localhost:4100',
            token: 'test',
            client: client,
          ),
        );
        addTearDown(controller.dispose);
        await controller.refresh();
        await tester.pumpWidget(
          OpenRideMapScope(
            loadTiles: false,
            child: OpenRideApp(controller: controller),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('NZD 18.60'), findsOneWidget);
        await tester.ensureVisible(find.text('Accept ride'));
        await tester.tap(find.text('Accept ride'));
        await tester.pumpAndSettle();
        expect(find.text('Ride confirmed'), findsOneWidget);
        final accept = tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, 'Accept ride'),
        );
        expect(accept.onPressed, isNull);
        await tester.ensureVisible(find.text('Start trip'));
        await tester.tap(find.text('Start trip'));
        await tester.pumpAndSettle();
        expect(find.text('On the way'), findsOneWidget);
        await tester.ensureVisible(find.text('Complete trip'));
        await tester.tap(find.text('Complete trip'));
        await tester.pumpAndSettle();
        expect(
          find.text('Trip complete. You are ready for your next ride.'),
          findsOneWidget,
        );
      },
    );
  }

  testWidgets(
    'unresolved booking blocks other accepts and offers reconciliation',
    (tester) async {
      final controller = DriverController(
        OpenRideApi(
          baseUrl: 'http://localhost:4100',
          token: 'test',
          client: MockClient(
            (_) async => http.Response(jsonEncode(snapshot('resolving')), 200),
          ),
        ),
      );
      addTearDown(controller.dispose);
      await controller.refresh();
      await tester.pumpWidget(
        OpenRideMapScope(
          loadTiles: false,
          child: OpenRideApp(controller: controller),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Check confirmation'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Accept ride'),
            )
            .onPressed,
        isNull,
      );
      expect(find.text('Start trip'), findsNothing);
    },
  );

  testWidgets(
    'connection failure shows retry and disables acceptance of stale offers',
    (tester) async {
      var offline = false;
      final client = MockClient((_) async {
        if (offline) throw http.ClientException('Offline');
        return http.Response(jsonEncode(snapshot()), 200);
      });
      final controller = DriverController(
        OpenRideApi(
          baseUrl: 'http://localhost:4100',
          token: 'test',
          client: client,
        ),
      );
      addTearDown(controller.dispose);
      await controller.refresh();
      offline = true;
      await controller.refresh();
      await tester.pumpWidget(
        OpenRideMapScope(
          loadTiles: false,
          child: OpenRideApp(controller: controller),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Accept ride'),
            )
            .onPressed,
        isNull,
      );
    },
  );
}
