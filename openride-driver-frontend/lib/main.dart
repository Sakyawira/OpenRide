import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:openride_protocol/openride_protocol.dart';
import 'package:openride_design_system/openride_design_system.dart';
import 'driver_controller.dart';

void main() => runApp(const OpenRideApp());

class OpenRideApp extends StatelessWidget {
  const OpenRideApp({super.key, this.controller});
  final DriverController? controller;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'OpenRide',
    debugShowCheckedModeBanner: false,
    theme: openRideTheme(),
    home: DriverHome(controller: controller),
  );
}

class DriverHome extends StatefulWidget {
  const DriverHome({super.key, this.controller});
  final DriverController? controller;
  @override
  State<DriverHome> createState() => _DriverHomeState();
}

class _DriverHomeState extends State<DriverHome> {
  late final DriverController driver;
  String? providerFilter;

  @override
  void initState() {
    super.initState();
    const configuredUrl = String.fromEnvironment('OPENRIDE_URL');
    driver =
        widget.controller ??
        DriverController(
          OpenRideApi(
            baseUrl: configuredUrl.isNotEmpty
                ? configuredUrl
                : kIsWeb
                ? Uri.base.origin
                : 'http://127.0.0.1:4100',
            token: const String.fromEnvironment(
              'DRIVER_TOKEN',
              defaultValue: 'openride-demo-driver',
            ),
          ),
        );
    if (widget.controller == null) driver.start();
  }

  @override
  void dispose() {
    if (widget.controller == null) driver.dispose();
    super.dispose();
  }

  Future<void> connection() async {
    final url = TextEditingController(text: driver.api.baseUrl);
    final token = TextEditingController(text: driver.api.token);
    final form = GlobalKey<FormState>();
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Connect to OpenRide'),
        content: SizedBox(
          width: 420,
          child: Form(
            key: form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'On your phone, use your Mac’s local address. Both devices must be on the same Wi-Fi.',
                ),
                const SizedBox(height: 20),
                TextFormField(
                  controller: url,
                  decoration: const InputDecoration(
                    labelText: 'Server URL',
                    hintText: 'http://192.168.1.10:4100',
                  ),
                  validator: (value) {
                    final uri = Uri.tryParse(value?.trim() ?? '');
                    return uri == null ||
                            !['http', 'https'].contains(uri.scheme) ||
                            uri.host.isEmpty ||
                            uri.userInfo.isNotEmpty
                        ? 'Enter an HTTP or HTTPS server URL.'
                        : null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: token,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Driver access token',
                  ),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Enter your access token.'
                      : null,
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          OpenRideButton(
            onPressed: () {
              if (form.currentState!.validate()) Navigator.pop(context, true);
            },
            child: const Text('Connect'),
          ),
        ],
      ),
    );
    final serverUrl = url.text.trim();
    final accessToken = token.text.trim();
    // Controllers are released after the dialog route's closing animation.
    await Future<void>.delayed(const Duration(milliseconds: 300));
    url.dispose();
    token.dispose();
    if (result == true && mounted) await driver.connect(serverUrl, accessToken);
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: driver,
    builder: (context, _) {
      final snapshot = driver.snapshot;
      final booking = snapshot?.activeBooking;
      final offers =
          snapshot?.offers
              .where(
                (offer) =>
                    !offer.expired &&
                    (providerFilter == null ||
                        offer.providerId == providerFilter),
              )
              .toList() ??
          [];
      final wide = MediaQuery.sizeOf(context).width >= 900;
      return Scaffold(
        body: SafeArea(
          child: SingleChildScrollView(
            padding: EdgeInsets.all(wide ? 36 : 20),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1200),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const OpenRideLogo(),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                            'OpenRide',
                            style: TextStyle(
                              fontSize: 25,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -1,
                            ),
                          ),
                        ),
                        if (wide)
                          const Text(
                            'DRIVER WORKSPACE',
                            style: TextStyle(
                              fontSize: 11,
                              letterSpacing: 2,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        const SizedBox(width: 16),
                        IconButton(
                          tooltip: 'Connection settings',
                          onPressed: driver.busy ? null : connection,
                          icon: const Icon(Icons.settings_outlined),
                        ),
                      ],
                    ),
                    const SizedBox(height: 36),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        const OpenRideBadge(
                          'DEMO NETWORK',
                          Icons.science_outlined,
                        ),
                        OpenRideBadge(
                          driver.connected
                              ? 'Connected · refreshes every 2s'
                              : 'Connecting / offline',
                          driver.connected ? Icons.wifi : Icons.wifi_off,
                          muted: true,
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Your next ride.\nYour choice.',
                      style: TextStyle(
                        fontSize: wide ? 48 : 36,
                        height: 1.12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -1.8,
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'One view of your providers. One ride at a time.',
                      style: TextStyle(
                        fontSize: 16,
                        color: OpenRideColors.muted,
                      ),
                    ),
                    const SizedBox(height: 28),
                    if (driver.error != null)
                      OpenRideNotice(
                        text: driver.error!,
                        warning: true,
                        action: TextButton(
                          onPressed: driver.refresh,
                          child: const Text('Retry'),
                        ),
                      ),
                    if (driver.notice != null)
                      OpenRideNotice(text: driver.notice!),
                    if (driver.busy)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 16),
                        child: LinearProgressIndicator(minHeight: 3),
                      ),
                    if (!wide) ...[
                      activeCard(booking),
                      const SizedBox(height: 24),
                    ],
                    if (wide)
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: feed(offers)),
                          const SizedBox(width: 28),
                          SizedBox(width: 340, child: activeCard(booking)),
                        ],
                      )
                    else
                      feed(offers),
                    const SizedBox(height: 30),
                    const Divider(),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 16,
                      runSpacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        const Text(
                          'Simulated rides in Auckland · No real dispatch or payments',
                          style: TextStyle(
                            fontSize: 12,
                            color: OpenRideColors.muted,
                          ),
                        ),
                        TextButton.icon(
                          onPressed: driver.busy || !driver.connected
                              ? null
                              : driver.seed,
                          icon: const Icon(Icons.add_circle_outline, size: 18),
                          label: const Text('New demo offers'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    },
  );

  Widget feed(List<Offer> offers) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          const Expanded(
            child: Text(
              'Available rides',
              style: TextStyle(fontSize: 23, fontWeight: FontWeight.w700),
            ),
          ),
          IconButton(
            onPressed: driver.refresh,
            tooltip: 'Refresh offers',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          ChoiceChip(
            label: const Text('All providers'),
            selected: providerFilter == null,
            onSelected: (_) => setState(() => providerFilter = null),
          ),
          for (final provider
              in driver.snapshot?.providers ?? <ProviderStatus>[])
            ChoiceChip(
              label: Text(
                '${provider.name.split(' ').first}${provider.available ? '' : ' · offline'}',
              ),
              selected: providerFilter == provider.id,
              onSelected: (_) => setState(() => providerFilter = provider.id),
            ),
        ],
      ),
      const SizedBox(height: 20),
      if (driver.snapshot == null && driver.error == null)
        const Center(
          child: Padding(
            padding: EdgeInsets.all(32),
            child: CircularProgressIndicator(),
          ),
        ),
      if (driver.snapshot != null && offers.isEmpty)
        const Card(
          child: Padding(
            padding: EdgeInsets.all(28),
            child: Text(
              'No offers here right now. Try another provider or add new demo offers below.',
            ),
          ),
        ),
      for (final offer in offers)
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: OpenRideOfferCard(
            offer: RideOfferData(
              providerName: offer.providerName,
              pickup: offer.pickup,
              destination: offer.destination,
              payout: offer.payout,
              pickupMinutes: offer.pickupMinutes,
              tripMinutes: offer.tripMinutes,
              distanceKm: offer.distanceKm,
              alternateProvider: offer.providerId == 'city',
            ),
            onAccept:
                driver.busy ||
                    !driver.connected ||
                    driver.snapshot?.activeBooking != null
                ? null
                : () => driver.accept(offer),
          ),
        ),
    ],
  );

  Widget activeCard(Booking? booking) {
    final enabled = !driver.busy && driver.connected && booking != null;
    final panel = OpenRideTripPanel(
      trip: booking == null
          ? null
          : RideTripData(
              providerName: booking.offer.providerName,
              pickup: booking.offer.pickup,
              destination: booking.offer.destination,
              payout: booking.offer.payout,
              state: switch (booking.state) {
                'confirmed' => OpenRideTripState.confirmed,
                'in_progress' => OpenRideTripState.inProgress,
                _ => OpenRideTripState.confirming,
              },
              lastError: booking.lastError,
            ),
      onStart: enabled ? () => driver.action(booking, 'start') : null,
      onCancel: enabled ? () => driver.action(booking, 'cancel') : null,
      onComplete: enabled ? () => driver.action(booking, 'complete') : null,
      onReconcile: enabled ? () => driver.reconcile(booking) : null,
    );
    final locations = booking?.offer.locations;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        panel,
        const SizedBox(height: 16),
        OpenRideMap(
          pickup: locations == null
              ? null
              : MapPoint(locations.pickup.latitude, locations.pickup.longitude),
          destination: locations == null
              ? null
              : MapPoint(
                  locations.destination.latitude,
                  locations.destination.longitude,
                ),
        ),
        if (locations == null)
          const Text(
            'Map pins appear when a rider selects their stops on the map.',
            style: TextStyle(fontSize: 12),
          ),
      ],
    );
  }
}
