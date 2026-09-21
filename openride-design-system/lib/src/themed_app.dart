import 'package:flutter/material.dart';
import 'branding.dart';

/// An app-level appearance choice. System follows changes to the device theme.
class OpenRideThemedApp extends StatefulWidget {
  const OpenRideThemedApp({super.key, required this.title, required this.home});
  final String title;
  final Widget home;

  @override
  State<OpenRideThemedApp> createState() => _OpenRideThemedAppState();
}

class _OpenRideThemedAppState extends State<OpenRideThemedApp> {
  ThemeMode mode = ThemeMode.system;

  @override
  Widget build(BuildContext context) => _AppearanceScope(
    mode: mode,
    onChanged: (value) => setState(() => mode = value),
    child: MaterialApp(
      title: widget.title,
      debugShowCheckedModeBanner: false,
      theme: openRideTheme(),
      darkTheme: openRideTheme(brightness: Brightness.dark),
      themeMode: mode,
      home: widget.home,
    ),
  );
}

class _AppearanceScope extends InheritedWidget {
  const _AppearanceScope({
    required this.mode,
    required this.onChanged,
    required super.child,
  });
  final ThemeMode mode;
  final ValueChanged<ThemeMode> onChanged;

  @override
  bool updateShouldNotify(_AppearanceScope oldWidget) => mode != oldWidget.mode;
}

/// A visible toggle with an additional option to return to the system setting.
class OpenRideThemeToggle extends StatelessWidget {
  const OpenRideThemeToggle({super.key});

  @override
  Widget build(BuildContext context) {
    final appearance = context
        .dependOnInheritedWidgetOfExactType<_AppearanceScope>();
    final dark = Theme.of(context).brightness == Brightness.dark;
    return PopupMenuButton<ThemeMode>(
      tooltip: 'Appearance',
      initialValue: appearance?.mode ?? ThemeMode.system,
      icon: Icon(dark ? Icons.dark_mode_outlined : Icons.light_mode_outlined),
      onSelected: appearance?.onChanged,
      itemBuilder: (_) => [
        for (final mode in ThemeMode.values)
          CheckedPopupMenuItem(
            value: mode,
            checked: appearance?.mode == mode,
            child: Text(switch (mode) {
              ThemeMode.system => 'Use device theme',
              ThemeMode.light => 'Light mode',
              ThemeMode.dark => 'Dark mode',
            }),
          ),
      ],
    );
  }
}
