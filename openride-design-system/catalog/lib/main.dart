import 'package:flutter/material.dart';
import 'package:openride_design_system/openride_design_system.dart';
import 'package:widgetbook/widgetbook.dart';

void main() => runApp(const OpenRideCatalog());

class OpenRideCatalog extends StatelessWidget {
  const OpenRideCatalog({super.key});

  @override
  Widget build(BuildContext context) => Widgetbook.material(
    lightTheme: openRideTheme(),
    header: const Padding(
      padding: EdgeInsets.all(16),
      child: Row(
        children: [
          OpenRideLogo(size: 36),
          SizedBox(width: 8),
          Text('OpenRide UI'),
        ],
      ),
    ),
    home: Theme(
      data: openRideTheme(),
      child: const Scaffold(
        body: Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                OpenRideLogo(size: 112),
                SizedBox(height: 24),
                Text(
                  'OpenRide Design System',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
                ),
                SizedBox(height: 12),
                Text(
                  'Choose a component to explore its states.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    ),
    appBuilder: (context, child) => Theme(
      data: openRideTheme(),
      child: Scaffold(
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 540),
              child: child,
            ),
          ),
        ),
      ),
    ),
    directories: [
      WidgetbookFolder(
        name: 'Foundations',
        children: [
          WidgetbookComponent(
            name: 'Brand',
            useCases: [
              WidgetbookUseCase(
                name: 'Logo',
                builder: (_) => const Column(
                  children: [
                    OpenRideLogo(size: 160),
                    SizedBox(height: 16),
                    Text(
                      'OpenRide',
                      style: TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              WidgetbookUseCase(
                name: 'Palette',
                builder: (_) => Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    for (final entry in {
                      'Navy': OpenRideColors.navy,
                      'Deep navy': OpenRideColors.deepNavy,
                      'Aqua': OpenRideColors.aqua,
                      'Cyan': OpenRideColors.cyan,
                      'Mist': OpenRideColors.mist,
                    }.entries)
                      SizedBox(
                        width: 130,
                        child: Column(
                          children: [
                            Container(
                              height: 100,
                              decoration: BoxDecoration(
                                color: entry.value,
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(entry.key),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      WidgetbookFolder(
        name: 'Components',
        children: [
          WidgetbookComponent(
            name: 'Button',
            useCases: [
              WidgetbookUseCase(
                name: 'Interactive',
                builder: (context) => OpenRideButton(
                  onPressed: context.knobs.boolean(label: 'Disabled')
                      ? null
                      : () => feedback(context, 'Button pressed'),
                  child: Text(
                    context.knobs.string(
                      label: 'Label',
                      initialValue: 'Accept ride',
                    ),
                  ),
                ),
              ),
              WidgetbookUseCase(
                name: 'On navy',
                builder: (context) => Container(
                  padding: const EdgeInsets.all(24),
                  color: OpenRideColors.deepNavy,
                  child: OpenRideButton(
                    onDark: true,
                    onPressed: () => feedback(context, 'Trip action pressed'),
                    child: const Text('Start trip'),
                  ),
                ),
              ),
            ],
          ),
          WidgetbookComponent(
            name: 'Badge',
            useCases: [
              WidgetbookUseCase(
                name: 'Provider',
                builder: (context) => OpenRideBadge(
                  context.knobs.string(
                    label: 'Label',
                    initialValue: 'Harbour Cooperative',
                  ),
                  Icons.local_taxi_outlined,
                  muted: context.knobs.boolean(label: 'Muted'),
                ),
              ),
            ],
          ),
          WidgetbookComponent(
            name: 'Notice',
            useCases: [
              WidgetbookUseCase(
                name: 'Information and warning',
                builder: (context) => OpenRideNotice(
                  text: context.knobs.string(
                    label: 'Message',
                    initialValue: 'Your reservation is protected.',
                  ),
                  warning: context.knobs.boolean(label: 'Warning'),
                  action: TextButton(
                    onPressed: () => feedback(context, 'Retry pressed'),
                    child: const Text('Retry'),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
      WidgetbookFolder(
        name: 'Ride patterns',
        children: [
          WidgetbookComponent(
            name: 'Offer card',
            useCases: [
              WidgetbookUseCase(
                name: 'Available and reserved',
                builder: (context) => OpenRideOfferCard(
                  offer: RideOfferData(
                    providerName: 'Harbour Cooperative',
                    pickup: context.knobs.string(
                      label: 'Pickup',
                      initialValue: 'Britomart',
                    ),
                    destination: 'Ponsonby Central',
                    payout: 'NZD 18.60',
                    pickupMinutes: 4,
                    tripMinutes: 14,
                    distanceKm: 4.2,
                  ),
                  onAccept:
                      context.knobs.boolean(label: 'Driver already reserved')
                      ? null
                      : () => feedback(
                          context,
                          'Accept callback — catalogue only',
                        ),
                ),
              ),
            ],
          ),
          WidgetbookComponent(
            name: 'Rider journey',
            useCases: [
              WidgetbookUseCase(
                name: 'Journey status',
                builder: (context) => OpenRideJourneyCard(
                  pickup: 'Britomart',
                  destination: 'Newmarket',
                  provider: 'Harbour Cooperative',
                  fare: 'NZD 19.90',
                  status: context.knobs.string(
                    label: 'Status',
                    initialValue: 'Driver confirmed',
                  ),
                  message: 'Your journey updates from the ride provider.',
                ),
              ),
            ],
          ),
          WidgetbookComponent(
            name: 'Map',
            useCases: [
              WidgetbookUseCase(
                name: 'Pickup and destination',
                builder: (_) => const OpenRideMap(
                  pickup: MapPoint(-36.844, 174.768),
                  destination: MapPoint(-36.869, 174.778),
                ),
              ),
            ],
          ),
          WidgetbookComponent(
            name: 'Trip panel',
            useCases: [
              WidgetbookUseCase(
                name: 'Available',
                builder: (_) => const OpenRideTripPanel(),
              ),
              for (final state in OpenRideTripState.values)
                WidgetbookUseCase(
                  name: state.name,
                  builder: (context) => OpenRideTripPanel(
                    trip: RideTripData(
                      providerName: 'City Cooperative',
                      pickup: 'Commercial Bay',
                      destination: 'Newmarket',
                      payout: 'NZD 21.40',
                      state: state,
                    ),
                    onStart: () => feedback(context, 'Start callback'),
                    onCancel: () => feedback(context, 'Cancel callback'),
                    onComplete: () => feedback(context, 'Complete callback'),
                    onReconcile: () => feedback(context, 'Reconcile callback'),
                  ),
                ),
            ],
          ),
        ],
      ),
    ],
  );
}

void feedback(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
