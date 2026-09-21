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

/// Semantic colours shared by the apps and component catalogue.
ThemeData openRideTheme({Brightness brightness = Brightness.light}) {
  final dark = brightness == Brightness.dark;
  final scheme = dark
      ? const ColorScheme.dark(
          primary: OpenRideColors.aqua,
          onPrimary: OpenRideColors.deepNavy,
          primaryContainer: OpenRideColors.navy,
          onPrimaryContainer: OpenRideColors.mist,
          secondary: OpenRideColors.aqua,
          onSecondary: OpenRideColors.deepNavy,
          secondaryContainer: Color(0xFF173E4D),
          onSecondaryContainer: OpenRideColors.mist,
          tertiaryContainer: Color(0xFF49351C),
          onTertiaryContainer: Color(0xFFFFE3AE),
          surface: Color(0xFF102E3F),
          onSurface: Color(0xFFE4F5F8),
          onSurfaceVariant: Color(0xFFA9C5D0),
          surfaceContainerHighest: Color(0xFF1B3D50),
          outline: Color(0xFF799CAB),
          outlineVariant: OpenRideColors.darkBorder,
          error: Color(0xFFFFB4AB),
          onError: Color(0xFF690005),
          errorContainer: Color(0xFF662723),
          onErrorContainer: Color(0xFFFFDAD6),
        )
      : const ColorScheme.light(
          primary: OpenRideColors.navy,
          onPrimary: Colors.white,
          primaryContainer: OpenRideColors.mist,
          onPrimaryContainer: OpenRideColors.navy,
          secondary: OpenRideColors.aqua,
          onSecondary: OpenRideColors.deepNavy,
          secondaryContainer: OpenRideColors.mist,
          onSecondaryContainer: OpenRideColors.navy,
          tertiaryContainer: OpenRideColors.warning,
          onTertiaryContainer: OpenRideColors.deepNavy,
          surface: Colors.white,
          onSurface: OpenRideColors.navy,
          onSurfaceVariant: OpenRideColors.muted,
          surfaceContainerHighest: OpenRideColors.subtle,
          outline: OpenRideColors.muted,
          outlineVariant: OpenRideColors.border,
        );
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: dark
        ? const Color(0xFF081F2C)
        : OpenRideColors.canvas,
    textTheme: (dark ? ThemeData.dark() : ThemeData.light()).textTheme.apply(
      bodyColor: scheme.onSurface,
      displayColor: scheme.onSurface,
    ),
    dividerColor: scheme.outlineVariant,
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 18),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: scheme.surface,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
  );
}
