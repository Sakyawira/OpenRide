import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import 'branding.dart';

/// UI-only map coordinates; applications map their protocol models to this type.
class MapPoint {
  const MapPoint(this.latitude, this.longitude);
  final double latitude, longitude;
  LatLng get latLng => LatLng(latitude, longitude);
}

/// Allows offline previews and widget tests without fetching public map tiles.
class OpenRideMapScope extends InheritedWidget {
  const OpenRideMapScope({
    super.key,
    required this.loadTiles,
    required super.child,
  });
  final bool loadTiles;
  @override
  bool updateShouldNotify(OpenRideMapScope oldWidget) =>
      loadTiles != oldWidget.loadTiles;
}

class OpenRideMap extends StatefulWidget {
  const OpenRideMap({
    super.key,
    this.pickup,
    this.destination,
    this.onSelect,
    this.height = 270,
  });
  final MapPoint? pickup, destination;
  final ValueChanged<MapPoint>? onSelect;
  final double height;
  @override
  State<OpenRideMap> createState() => _OpenRideMapState();
}

class _OpenRideMapState extends State<OpenRideMap> {
  final controller = MapController();
  bool ready = false;
  bool tilesUnavailable = false;
  // Map luminance into the brand's navy-to-canvas range. Apply this only to
  // raster tiles: markers, controls and attribution retain their own contrast.
  static const tileTone = ColorFilter.matrix([
    0.180917,
    0.608621,
    0.061441,
    0,
    25,
    0.155073,
    0.521675,
    0.052664,
    0,
    66,
    0.132562,
    0.445948,
    0.045019,
    0,
    94,
    0,
    0,
    0,
    1,
    0,
  ]);
  // In dark mode, pale land becomes navy and dark labels become light blue.
  static const darkTileTone = ColorFilter.matrix([
    -0.084206,
    -0.283275,
    -0.028597,
    0,
    116,
    -0.095878,
    -0.322541,
    -0.032561,
    0,
    158,
    -0.099213,
    -0.33376,
    -0.033693,
    0,
    177,
    0,
    0,
    0,
    1,
    0,
  ]);
  static const tileUrl = String.fromEnvironment(
    'OSM_TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  void fitStops() {
    if (!ready) return;
    final points = [
      if (widget.pickup != null) widget.pickup!.latLng,
      if (widget.destination != null) widget.destination!.latLng,
    ];
    if (points.length == 2 && points.first != points.last) {
      controller.fitCamera(
        CameraFit.bounds(
          bounds: LatLngBounds.fromPoints(points),
          padding: const EdgeInsets.all(42),
          maxZoom: 16,
        ),
      );
    } else if (points.isNotEmpty) {
      controller.move(points.first, 14);
    }
  }

  @override
  void didUpdateWidget(OpenRideMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Do not interrupt a rider panning the map to place the next pin.
    if (widget.onSelect == null &&
        (oldWidget.pickup?.latitude != widget.pickup?.latitude ||
            oldWidget.pickup?.longitude != widget.pickup?.longitude ||
            oldWidget.destination?.latitude != widget.destination?.latitude ||
            oldWidget.destination?.longitude !=
                widget.destination?.longitude)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) fitStops();
      });
    }
  }

  Marker marker(MapPoint point, String label, Color color, Color foreground) =>
      Marker(
        point: point.latLng,
        width: 42,
        height: 42,
        child: Semantics(
          label: label == 'P' ? 'Pickup map pin' : 'Destination map pin',
          child: Container(
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(label == 'P' ? 22 : 12),
              border: Border.all(color: Colors.white, width: 3),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x3319425E),
                  blurRadius: 10,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            alignment: Alignment.center,
            child: Text(
              label,
              style: TextStyle(
                color: foreground,
                fontSize: 15,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final loadTiles =
        context
            .dependOnInheritedWidgetOfExactType<OpenRideMapScope>()
            ?.loadTiles ??
        true;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).scaffoldBackgroundColor,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(1),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(21),
              child: SizedBox(
                height: widget.height,
                child: Stack(
                  children: [
                    FlutterMap(
                      mapController: controller,
                      options: MapOptions(
                        initialCenter:
                            widget.pickup?.latLng ??
                            const LatLng(-36.8485, 174.7633),
                        initialZoom: 13,
                        minZoom: 3,
                        maxZoom: 19,
                        backgroundColor: Theme.of(
                          context,
                        ).colorScheme.surfaceContainerHighest,
                        interactionOptions: const InteractionOptions(
                          flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                        ),
                        onMapReady: () {
                          ready = true;
                          fitStops();
                        },
                        onTap: widget.onSelect == null
                            ? null
                            : (_, point) => widget.onSelect!(
                                MapPoint(
                                  point.latitude.clamp(-90, 90).toDouble(),
                                  (point.longitude + 180) % 360 - 180,
                                ),
                              ),
                      ),
                      children: [
                        if (loadTiles)
                          ColorFiltered(
                            colorFilter:
                                Theme.of(context).brightness == Brightness.dark
                                ? darkTileTone
                                : tileTone,
                            child: TileLayer(
                              urlTemplate: tileUrl,
                              userAgentPackageName:
                                  'org.openride.reference (https://github.com/Sakyawira/OpenRide)',
                              maxNativeZoom: 19,
                              panBuffer: 0,
                              errorTileCallback: (_, _, _) {
                                if (!tilesUnavailable && mounted) {
                                  WidgetsBinding.instance.addPostFrameCallback((
                                    _,
                                  ) {
                                    if (mounted) {
                                      setState(() => tilesUnavailable = true);
                                    }
                                  });
                                }
                              },
                            ),
                          ),
                        MarkerLayer(
                          markers: [
                            if (widget.pickup != null)
                              marker(
                                widget.pickup!,
                                'P',
                                OpenRideColors.navy,
                                Colors.white,
                              ),
                            if (widget.destination != null)
                              marker(
                                widget.destination!,
                                'D',
                                OpenRideColors.aqua,
                                OpenRideColors.deepNavy,
                              ),
                          ],
                        ),
                      ],
                    ),
                    Positioned(
                      top: 12,
                      right: 12,
                      child: Material(
                        color: Theme.of(context).scaffoldBackgroundColor,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: BorderSide(
                            color: Theme.of(context).colorScheme.outlineVariant,
                          ),
                        ),
                        child: IconButton(
                          tooltip: 'Show both stops',
                          color: Theme.of(context).colorScheme.primary,
                          hoverColor: Theme.of(
                            context,
                          ).colorScheme.primaryContainer,
                          highlightColor: Theme.of(
                            context,
                          ).colorScheme.primary.withValues(alpha: 0.2),
                          onPressed: fitStops,
                          icon: const Icon(Icons.center_focus_strong),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            const Wrap(
              spacing: 12,
              children: [
                _MapLegend(
                  label: 'P',
                  title: 'Pickup',
                  color: OpenRideColors.navy,
                  foreground: Colors.white,
                ),
                _MapLegend(
                  label: 'D',
                  title: 'Destination',
                  color: OpenRideColors.aqua,
                  foreground: OpenRideColors.deepNavy,
                ),
              ],
            ),
            TextButton(
              onPressed: () => launchUrl(
                Uri.parse('https://www.openstreetmap.org/copyright'),
              ),
              child: Text(
                '© OpenStreetMap contributors',
                style: TextStyle(
                  fontSize: 10,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
        if (tilesUnavailable)
          const Text(
            'Map tiles are unavailable. You can still enter your stops.',
            style: TextStyle(fontSize: 12),
          ),
      ],
    );
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }
}

class _MapLegend extends StatelessWidget {
  const _MapLegend({
    required this.label,
    required this.title,
    required this.color,
    required this.foreground,
  });
  final String label, title;
  final Color color, foreground;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 20,
        height: 20,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(label == 'P' ? 10 : 6),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: foreground,
            fontSize: 10,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      const SizedBox(width: 5),
      Text(
        title,
        style: TextStyle(
          fontSize: 11,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    ],
  );
}
