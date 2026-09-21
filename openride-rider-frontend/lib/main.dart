import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:openride_design_system/openride_design_system.dart';
import 'package:openride_protocol/openride_protocol.dart';
import 'rider_controller.dart';

void main() => runApp(const OpenRideRiderApp());

class OpenRideRiderApp extends StatelessWidget {
  const OpenRideRiderApp({super.key, this.controller});
  final RiderController? controller;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'OpenRide Rider',
    debugShowCheckedModeBanner: false,
    theme: openRideTheme(),
    home: RiderHome(controller: controller),
  );
}

class RiderHome extends StatefulWidget {
  const RiderHome({super.key, this.controller});
  final RiderController? controller;
  @override
  State<RiderHome> createState() => _RiderHomeState();
}

class _RiderHomeState extends State<RiderHome> {
  late final RiderController rider;
  final pickup = TextEditingController();
  final destination = TextEditingController();
  final form = GlobalKey<FormState>();
  String providerId = 'harbour';
  GeoPoint? pickupPoint, destinationPoint;
  bool selectingPickup = true;
  RideLocations? get locations =>
      pickupPoint != null && destinationPoint != null
      ? RideLocations(pickup: pickupPoint!, destination: destinationPoint!)
      : null;
  bool get incompletePins =>
      (pickupPoint == null) != (destinationPoint == null);
  RideQuote? get currentQuote {
    final quote = rider.quote;
    return quote != null &&
            quote.providerId == providerId &&
            quote.pickup == pickup.text.trim() &&
            quote.destination == destination.text.trim() &&
            (quote.locations?.sameAs(locations) ?? locations == null)
        ? quote
        : null;
  }

  @override
  void initState() {
    super.initState();
    const url = String.fromEnvironment('OPENRIDE_URL');
    rider =
        widget.controller ??
        RiderController(
          OpenRideApi(
            baseUrl: url.isNotEmpty
                ? url
                : kIsWeb
                ? Uri.base.origin
                : 'http://127.0.0.1:4100',
            token: const String.fromEnvironment(
              'RIDER_TOKEN',
              defaultValue: 'openride-demo-rider',
            ),
          ),
        );
    if (widget.controller == null) rider.start();
  }

  @override
  void dispose() {
    pickup.dispose();
    destination.dispose();
    if (widget.controller == null) rider.dispose();
    super.dispose();
  }

  Future<void> connection() async {
    final url = TextEditingController(text: rider.api.baseUrl);
    final token = TextEditingController(text: rider.api.token);
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Connect your rider app'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: url,
                decoration: const InputDecoration(labelText: 'Server URL'),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: token,
                decoration: const InputDecoration(labelText: 'Rider token'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Connect'),
          ),
        ],
      ),
    );
    if (accepted == true) {
      final parsed = Uri.tryParse(url.text.trim());
      if (parsed != null &&
          ['http', 'https'].contains(parsed.scheme) &&
          parsed.host.isNotEmpty &&
          parsed.userInfo.isEmpty) {
        await rider.connect(url.text.trim(), token.text.trim());
      }
    }
    url.dispose();
    token.dispose();
  }

  String label(String status) => switch (status) {
    'searching' => 'Finding a driver',
    'matching' => 'Confirming your driver',
    'confirmed' => 'Driver confirmed',
    'in_progress' => 'On your way',
    'completed' => 'Arrived',
    _ => 'Request expired',
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: ListenableBuilder(
        listenable: rider,
        builder: (context, _) => SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1120),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const OpenRideLogo(size: 52),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text(
                          'OpenRide',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const Text('RIDER'),
                      IconButton(
                        tooltip: 'Connection settings',
                        onPressed: connection,
                        icon: const Icon(Icons.settings_outlined),
                      ),
                    ],
                  ),
                  const SizedBox(height: 36),
                  const Text(
                    'Where are we\ngoing today?',
                    style: TextStyle(
                      fontSize: 42,
                      height: 1.12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'One request. Drivers across the network. Choose a route and watch your ride come together.',
                  ),
                  const SizedBox(height: 28),
                  if (rider.error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: OpenRideNotice(
                        text: rider.error!,
                        warning: true,
                        action: TextButton(
                          onPressed: rider.refresh,
                          child: const Text('Retry'),
                        ),
                      ),
                    ),
                  if (rider.notice != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: OpenRideNotice(text: rider.notice!),
                    ),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final requestForm = Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: OpenRideColors.mist,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Form(
                          key: form,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text(
                                'Plan a ride',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 16),
                              Wrap(
                                spacing: 8,
                                children: [
                                  ChoiceChip(
                                    label: const Text('Pick up here'),
                                    selected: selectingPickup,
                                    onSelected: (_) =>
                                        setState(() => selectingPickup = true),
                                  ),
                                  ChoiceChip(
                                    label: const Text('Drop off here'),
                                    selected: !selectingPickup,
                                    onSelected: (_) =>
                                        setState(() => selectingPickup = false),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                selectingPickup
                                    ? 'Tap the map to set your pickup.'
                                    : 'Tap the map to set your destination.',
                              ),
                              const SizedBox(height: 8),
                              OpenRideMap(
                                pickup: pickupPoint == null
                                    ? null
                                    : MapPoint(
                                        pickupPoint!.latitude,
                                        pickupPoint!.longitude,
                                      ),
                                destination: destinationPoint == null
                                    ? null
                                    : MapPoint(
                                        destinationPoint!.latitude,
                                        destinationPoint!.longitude,
                                      ),
                                onSelect: rider.busy
                                    ? null
                                    : (point) => setState(() {
                                        final coordinate = GeoPoint(
                                          point.latitude,
                                          point.longitude,
                                        );
                                        if (selectingPickup) {
                                          pickupPoint = coordinate;
                                          pickup.text =
                                              'Map pickup (${point.latitude.toStringAsFixed(5)}, ${point.longitude.toStringAsFixed(5)})';
                                          selectingPickup = false;
                                        } else {
                                          destinationPoint = coordinate;
                                          destination.text =
                                              'Map destination (${point.latitude.toStringAsFixed(5)}, ${point.longitude.toStringAsFixed(5)})';
                                        }
                                      }),
                              ),
                              if (pickupPoint != null ||
                                  destinationPoint != null)
                                TextButton(
                                  onPressed: () => setState(() {
                                    pickupPoint = null;
                                    destinationPoint = null;
                                  }),
                                  child: const Text('Clear map pins'),
                                ),
                              const SizedBox(height: 16),
                              TextFormField(
                                controller: pickup,
                                onChanged: (_) =>
                                    setState(() => pickupPoint = null),
                                maxLength: 160,
                                decoration: const InputDecoration(
                                  labelText: 'Pickup',
                                  hintText: 'e.g. Britomart',
                                ),
                                validator: validatePlace,
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                controller: destination,
                                onChanged: (_) =>
                                    setState(() => destinationPoint = null),
                                maxLength: 160,
                                decoration: const InputDecoration(
                                  labelText: 'Destination',
                                  hintText: 'e.g. Newmarket',
                                ),
                                validator: validatePlace,
                              ),
                              const SizedBox(height: 16),
                              DropdownButtonFormField<String>(
                                isExpanded: true,
                                initialValue: providerId,
                                decoration: const InputDecoration(
                                  labelText: 'Ride provider',
                                ),
                                items: const [
                                  DropdownMenuItem(
                                    value: 'harbour',
                                    child: Text('Harbour Cooperative'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'city',
                                    child: Text('City Cooperative'),
                                  ),
                                ],
                                onChanged: rider.busy
                                    ? null
                                    : (value) =>
                                          setState(() => providerId = value!),
                              ),
                              const SizedBox(height: 24),
                              OpenRideButton(
                                onPressed:
                                    rider.busy ||
                                        !rider.connected ||
                                        incompletePins
                                    ? null
                                    : () async {
                                        if (form.currentState!.validate()) {
                                          final quote = currentQuote;
                                          if (quote == null) {
                                            await rider.getQuote(
                                              providerId,
                                              pickup.text,
                                              destination.text,
                                              locations: locations,
                                            );
                                            return;
                                          }
                                          final sent = await rider.request(
                                            providerId,
                                            pickup.text,
                                            destination.text,
                                            expectedPrice: quote.price,
                                            locations: locations,
                                          );
                                          if (mounted && sent) {
                                            pickup.clear();
                                            destination.clear();
                                            setState(() {
                                              pickupPoint = null;
                                              destinationPoint = null;
                                              selectingPickup = true;
                                            });
                                          }
                                        }
                                      },
                                child: Text(
                                  rider.busy
                                      ? 'Please wait…'
                                      : currentQuote == null
                                      ? 'Get a quote'
                                      : 'Request a ride',
                                ),
                              ),
                              const SizedBox(height: 16),
                              Text(
                                currentQuote == null
                                    ? incompletePins
                                          ? 'Set both pins, or clear them to enter text-only stops.'
                                          : 'Review your provider’s quote before requesting. No payment is taken.'
                                    : 'Quoted fare ${currentQuote!.price.fare} · No payment is taken.',
                              ),
                            ],
                          ),
                        ),
                      );
                      final journeys = Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Your journeys',
                                  style: TextStyle(
                                    fontSize: 24,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Refresh journeys',
                                onPressed: rider.refresh,
                                icon: const Icon(Icons.refresh),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          if ((rider.snapshot?.requests ?? []).isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 32),
                              child: Text(
                                'Your next journey starts here. Request a ride and its progress will appear here.',
                              ),
                            ),
                          for (final ride in rider.snapshot?.requests ?? [])
                            OpenRideJourneyCard(
                              pickup: ride.pickup,
                              destination: ride.destination,
                              provider: ride.providerName,
                              fare: ride.fare,
                              status: label(ride.status),
                              message: ride.status == 'completed'
                                  ? 'Thanks for riding with the network.'
                                  : 'Updates arrive automatically from your ride provider.',
                            ),
                        ],
                      );
                      return constraints.maxWidth < 760
                          ? Column(
                              children: [
                                requestForm,
                                const SizedBox(height: 28),
                                journeys,
                              ],
                            )
                          : Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SizedBox(width: 380, child: requestForm),
                                const SizedBox(width: 32),
                                Expanded(child: journeys),
                              ],
                            );
                    },
                  ),
                  const SizedBox(height: 36),
                  const Divider(),
                  const SizedBox(height: 16),
                  const Text(
                    'OpenRide demo · Simulated trips only · A driver using MockRide can accept this request.',
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );

  String? validatePlace(String? value) => (value?.trim().length ?? 0) < 3
      ? 'Enter a place with at least three characters.'
      : null;
}
