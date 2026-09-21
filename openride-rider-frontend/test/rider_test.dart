import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:openride_design_system/openride_design_system.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:openride_protocol/openride_protocol.dart';
import 'package:openride_rider/rider_controller.dart';
import 'package:openride_rider/main.dart';

Map<String, Object?> ride(String status) => {
  'id': '11111111-1111-4111-8111-111111111111',
  'providerId': 'harbour',
  'providerName': 'Harbour Cooperative',
  'pickup': 'Britomart',
  'destination': 'Newmarket',
  'fareMinor': 1990,
  'currency': 'NZD',
  'createdAt': '2026-09-21T00:00:00Z',
  'expiresAt': '2026-09-21T00:30:00Z',
  'status': status,
  'bookingId': null,
};

http.Response snapshot(String? status) => http.Response(
  jsonEncode({
    'requests': [if (status != null) ride(status)],
    'providers': [
      {'id': 'harbour', 'name': 'Harbour Cooperative', 'available': true},
    ],
  }),
  200,
  headers: {'content-type': 'application/json'},
);

void main() {
  test(
    'interrupted rider requests retry the same protocol key and role credential',
    () async {
      final keys = <String>[];
      final api = OpenRideApi(
        baseUrl: 'http://test',
        token: 'openride-demo-rider',
        client: MockClient((request) async {
          expect(
            request.headers['authorization'],
            'Bearer openride-demo-rider',
          );
          if (request.method == 'POST') {
            expect(jsonDecode(request.body), {
              'providerId': 'harbour',
              'pickup': 'Britomart',
              'destination': 'Newmarket',
            });
            keys.add(request.headers['idempotency-key']!);
            if (keys.length == 1) throw const FormatException('Lost response');
            return http.Response(jsonEncode(ride('searching')), 200);
          }
          return snapshot('searching');
        }),
      );
      final controller = RiderController(api);
      addTearDown(controller.dispose);
      expect(
        await controller.request('harbour', 'Britomart', 'Newmarket'),
        false,
      );
      expect(
        await controller.request('harbour', 'Britomart', 'Newmarket'),
        true,
      );
      expect(keys[0], keys[1]);
    },
  );

  testWidgets(
    'map pin selection sends both coordinates with the reviewed quote',
    (tester) async {
      tester.view.physicalSize = const Size(1280, 1500);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      Map<String, dynamic>? submitted;
      final api = OpenRideApi(
        baseUrl: 'http://test',
        token: 'rider',
        client: MockClient((request) async {
          if (request.url.path.endsWith('/quotes')) {
            return http.Response(
              jsonEncode({
                ...jsonDecode(request.body) as Map,
                'price': {
                  'fareMinor': 1990,
                  'payoutMinor': 1990,
                  'currency': 'NZD',
                  'pricingVersion': 'v1',
                },
              }),
              200,
            );
          }
          if (request.method == 'POST') {
            submitted = jsonDecode(request.body) as Map<String, dynamic>;
            return http.Response(
              jsonEncode({...ride('searching'), ...submitted!}),
              200,
            );
          }
          return snapshot(null);
        }),
      );
      final controller = RiderController(api);
      addTearDown(controller.dispose);
      await controller.refresh();
      await tester.pumpWidget(
        OpenRideMapScope(
          loadTiles: false,
          child: OpenRideRiderApp(controller: controller),
        ),
      );
      await tester.pumpAndSettle();
      final map = find.byType(OpenRideMap);
      await tester.ensureVisible(map);
      final origin = tester.getTopLeft(map);
      await tester.tapAt(origin + const Offset(110, 100));
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      expect(find.text('Tap the map to set your destination.'), findsOneWidget);
      await tester.tapAt(origin + const Offset(190, 180));
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Get a quote'));
      await tester.tap(find.text('Get a quote'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Request a ride'));
      await tester.pumpAndSettle();
      expect(submitted?['locations']['pickup']['latitude'], isA<double>());
      expect(
        submitted?['locations']['destination'],
        isNot(submitted?['locations']['pickup']),
      );
      expect(submitted?['expectedPrice']['fareMinor'], 1990);
      expect(tester.takeException(), isNull);
    },
  );

  for (final width in [390.0, 1280.0]) {
    testWidgets(
      'rider frontend at $width renders request, driver confirmation and completion',
      (tester) async {
        tester.view.physicalSize = Size(width, 1100);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        String? status;
        final api = OpenRideApi(
          baseUrl: 'http://test',
          token: 'openride-demo-rider',
          client: MockClient((request) async {
            if (request.url.path.endsWith('/quotes')) {
              return http.Response(
                jsonEncode({
                  'providerId': 'harbour',
                  'pickup': 'Britomart',
                  'destination': 'Newmarket',
                  'price': {
                    'fareMinor': 1990,
                    'payoutMinor': 1990,
                    'currency': 'NZD',
                    'pricingVersion': 'openride-demo-v1',
                  },
                }),
                200,
              );
            }
            if (request.method == 'POST') {
              expect(
                (jsonDecode(request.body) as Map)['expectedPrice']['fareMinor'],
                1990,
              );
              status = 'searching';
              return http.Response(jsonEncode(ride(status!)), 200);
            }
            return snapshot(status);
          }),
        );
        final controller = RiderController(api);
        addTearDown(controller.dispose);
        await controller.refresh();
        await tester.pumpWidget(
          OpenRideMapScope(
            loadTiles: false,
            child: OpenRideRiderApp(controller: controller),
          ),
        );
        await tester.pumpAndSettle();
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Pickup'),
          'Britomart',
        );
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Destination'),
          'Newmarket',
        );
        await tester.ensureVisible(find.text('Get a quote'));
        await tester.tap(find.text('Get a quote'));
        await tester.pumpAndSettle();
        expect(
          find.text('Quoted fare NZD 19.90 · No payment is taken.'),
          findsOneWidget,
        );
        await tester.ensureVisible(find.text('Request a ride'));
        await tester.tap(find.text('Request a ride'));
        await tester.pumpAndSettle();
        expect(find.text('Finding a driver'), findsOneWidget);
        status = 'confirmed';
        await controller.refresh();
        await tester.pumpAndSettle();
        expect(find.text('Driver confirmed'), findsOneWidget);
        status = 'completed';
        await controller.refresh();
        await tester.pumpAndSettle();
        expect(find.text('Arrived'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
