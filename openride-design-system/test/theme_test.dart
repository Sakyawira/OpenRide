import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openride_design_system/openride_design_system.dart';

void main() {
  for (final brightness in Brightness.values) {
    test('$brightness keeps text readable on its semantic surfaces', () {
      final scheme = openRideTheme(brightness: brightness).colorScheme;
      for (final pair in [
        (scheme.onSurface, scheme.surface),
        (scheme.onSurfaceVariant, scheme.surface),
        (scheme.onPrimary, scheme.primary),
        (scheme.onPrimaryContainer, scheme.primaryContainer),
        (scheme.onSecondaryContainer, scheme.secondaryContainer),
        (scheme.onTertiaryContainer, scheme.tertiaryContainer),
      ]) {
        final a = pair.$1.computeLuminance();
        final b = pair.$2.computeLuminance();
        expect(
          (max(a, b) + 0.05) / (min(a, b) + 0.05),
          greaterThanOrEqualTo(4.5),
        );
      }
    });
  }

  testWidgets(
    'app appearance changes preserve form state and support the device theme',
    (tester) async {
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      await tester.pumpWidget(
        const OpenRideThemedApp(
          title: 'Appearance test',
          home: Scaffold(
            body: Column(
              children: [
                OpenRideThemeToggle(),
                TextField(decoration: InputDecoration(labelText: 'Pickup')),
                OpenRideNotice(text: 'Your reservation is protected.'),
              ],
            ),
          ),
        ),
      );
      await tester.enterText(find.byType(TextField), 'Britomart');
      Future<void> choose(String label) async {
        await tester.tap(find.byTooltip('Appearance'));
        await tester.pumpAndSettle();
        await tester.tap(
          find.widgetWithText(CheckedPopupMenuItem<ThemeMode>, label),
        );
        await tester.pumpAndSettle();
      }

      Brightness current() =>
          Theme.of(tester.element(find.byType(OpenRideNotice))).brightness;
      await choose('Dark mode');
      expect(current(), Brightness.dark);
      expect(find.text('Britomart'), findsOneWidget);
      await choose('Light mode');
      expect(current(), Brightness.light);
      await choose('Use device theme');
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      await tester.pumpAndSettle();
      expect(current(), Brightness.dark);
      expect(find.text('Britomart'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
