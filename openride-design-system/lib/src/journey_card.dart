import 'package:flutter/material.dart';
import 'branding.dart';

/// Rider-facing presentation; all status and money formatting comes from the client.
class OpenRideJourneyCard extends StatelessWidget {
  const OpenRideJourneyCard({
    super.key,
    required this.pickup,
    required this.destination,
    required this.provider,
    required this.fare,
    required this.status,
    required this.message,
  });
  final String pickup, destination, provider, fare, status, message;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: OpenRideColors.mist),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Chip(label: Text(status), backgroundColor: OpenRideColors.mist),
            Text(provider, style: const TextStyle(color: OpenRideColors.muted)),
          ],
        ),
        const SizedBox(height: 18),
        Text(
          pickup,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: Icon(Icons.south, size: 18),
        ),
        Text(
          destination,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 20),
        Text(
          fare,
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(message),
      ],
    ),
  );
}
