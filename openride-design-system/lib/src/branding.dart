import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

abstract final class OpenRideColors {
  // Sampled from the original assets/brand/logo.png.
  static const navy = Color(0xFF19425E);
  static const deepNavy = Color(0xFF0C2E4A);
  static const aqua = Color(0xFF80FAF5);
  static const cyan = Color(0xFFA3FCFC);
  static const mist = Color(0xFFCFFFFF);
  static const canvas = Color(0xFFF2FCFD);
  static const muted = Color(0xFF526F80);
  static const border = Color(0xFFCCE4EB);
  static const subtle = Color(0xFFE9F5F8);
  static const onDark = Color(0xFFC7EAF0);
  static const darkBorder = Color(0xFF31566D);
  static const warning = Color(0xFFFFEDCF);
}

class OpenRideLogo extends StatelessWidget {
  const OpenRideLogo({super.key, this.size = 56});
  final double size;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/brand/logo.svg',
    package: 'openride_design_system',
    width: size,
    height: size,
    semanticsLabel: 'OpenRide logo',
  );
}

ThemeData openRideTheme() => ThemeData(
  useMaterial3: true,
  colorScheme: const ColorScheme.light(
    primary: OpenRideColors.navy,
    onPrimary: Colors.white,
    primaryContainer: OpenRideColors.mist,
    onPrimaryContainer: OpenRideColors.navy,
    secondary: OpenRideColors.aqua,
    onSecondary: OpenRideColors.deepNavy,
    secondaryContainer: OpenRideColors.mist,
    onSecondaryContainer: OpenRideColors.navy,
    tertiary: OpenRideColors.navy,
    onTertiary: Colors.white,
    surface: Colors.white,
    onSurface: OpenRideColors.navy,
    onSurfaceVariant: OpenRideColors.muted,
    surfaceContainerHighest: OpenRideColors.subtle,
    outline: OpenRideColors.muted,
    outlineVariant: OpenRideColors.border,
  ),
  scaffoldBackgroundColor: OpenRideColors.canvas,
  textTheme: ThemeData.light().textTheme.apply(
    bodyColor: OpenRideColors.navy,
    displayColor: OpenRideColors.navy,
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 18),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  ),
  cardTheme: CardThemeData(
    elevation: 0,
    color: Colors.white,
    surfaceTintColor: Colors.transparent,
    margin: EdgeInsets.zero,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(20),
      side: const BorderSide(color: OpenRideColors.border),
    ),
  ),
);
