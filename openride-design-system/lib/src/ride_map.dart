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

  Marker marker(MapPoint point, String label, Color color) => Marker(
    point: point.latLng,
    width: 36,
    height: 36,
    child: Semantics(
      label: '$label map pin',
      child: Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
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
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
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
                    backgroundColor: OpenRideColors.mist,
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
                      TileLayer(
                        urlTemplate: tileUrl,
                        userAgentPackageName:
                            'org.openride.reference (https://github.com/Sakyawira/OpenRide)',
                        maxNativeZoom: 19,
                        panBuffer: 0,
                        errorTileCallback: (_, _, _) {
                          if (!tilesUnavailable && mounted) {
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (mounted) {
                                setState(() => tilesUnavailable = true);
                              }
                            });
                          }
                        },
                      ),
                    MarkerLayer(
                      markers: [
                        if (widget.pickup != null)
                          marker(widget.pickup!, 'P', OpenRideColors.navy),
                        if (widget.destination != null)
                          marker(
                            widget.destination!,
                            'D',
                            const Color(0xFF8B501E),
                          ),
                      ],
                    ),
                  ],
                ),
                Positioned(
                  top: 8,
                  right: 8,
                  child: Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    child: IconButton(
                      tooltip: 'Show both stops',
                      onPressed: fitStops,
                      icon: const Icon(Icons.center_focus_strong),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            const Text(
              'P · Pickup   D · Destination',
              style: TextStyle(fontSize: 11),
            ),
            TextButton(
              onPressed: () => launchUrl(
                Uri.parse('https://www.openstreetmap.org/copyright'),
              ),
              child: const Text(
                '© OpenStreetMap contributors',
                style: TextStyle(fontSize: 11),
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
