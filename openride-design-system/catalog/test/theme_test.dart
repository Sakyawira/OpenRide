import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openride_design_system/openride_design_system.dart';
import 'package:openride_widgetbook/main.dart';

void main() {
  testWidgets(
    'catalogue switch themes the actual component and retains its knobs',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        const OpenRideCatalog(
          initialRoute: '?path=components/button/interactive',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(OpenRideButton), findsOneWidget);
      final label = find.byWidgetPredicate(
        (widget) =>
            widget is TextField && widget.controller?.text == 'Accept ride',
      );
      await tester.enterText(label, 'Night ride');
      await tester.pumpAndSettle();
      final toggle = find.byKey(const ValueKey('catalogue-theme-toggle'));
      for (final brightness in [Brightness.dark, Brightness.light]) {
        await tester.tap(toggle);
        await tester.pumpAndSettle();
        expect(
          Theme.of(tester.element(find.byType(OpenRideButton))).brightness,
          brightness,
        );
        expect(
          tester.widget<Switch>(toggle).value,
          brightness == Brightness.dark,
        );
        expect(
          find.descendant(
            of: find.byType(OpenRideButton),
            matching: find.text('Night ride'),
          ),
          findsOneWidget,
        );
      }
      expect(tester.takeException(), isNull);
    },
  );
}
