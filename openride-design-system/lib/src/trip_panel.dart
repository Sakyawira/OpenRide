import 'package:flutter/material.dart';
import 'branding.dart';
import 'components.dart';
import 'view_data.dart';

class OpenRideTripPanel extends StatelessWidget {
  const OpenRideTripPanel({
    super.key,
    this.trip,
    this.onStart,
    this.onCancel,
    this.onComplete,
    this.onReconcile,
  });
  final RideTripData? trip;
  final VoidCallback? onStart, onCancel, onComplete, onReconcile;
  @override
  Widget build(BuildContext context) {
    final trip = this.trip;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: OpenRideColors.deepNavy,
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(22),
      ),
      child: DefaultTextStyle(
        style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.5),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  trip == null
                      ? Icons.check_circle_outline
                      : Icons.shield_outlined,
                  color: OpenRideColors.aqua,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    trip == null ? 'Your availability' : 'Your active ride',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Text(
              trip == null
                  ? 'Ready when\nyou are.'
                  : switch (trip.state) {
                      OpenRideTripState.confirmed => 'Ride confirmed',
                      OpenRideTripState.inProgress => 'On the way',
                      _ => 'Confirming your ride',
                    },
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 14),
            if (trip == null)
              const Text(
                'Choose an offer from either provider. Accepting a ride reserves your availability across this demo network.',
                style: TextStyle(color: OpenRideColors.onDark),
              )
            else ...[
              Text(
                trip.providerName,
                style: const TextStyle(color: OpenRideColors.aqua),
              ),
              const SizedBox(height: 18),
              Text(
                '${trip.pickup}\n↓\n${trip.destination}',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 16),
              Text(
                trip.payout,
                style: const TextStyle(
                  fontSize: 25,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 20),
              if (trip.resolving) ...[
                Text(
                  trip.lastError ??
                      'Waiting for the provider. Your reservation is protected.',
                  style: const TextStyle(color: OpenRideColors.onDark),
                ),
                const SizedBox(height: 16),
                OpenRideButton(
                  onDark: true,
                  onPressed: onReconcile,
                  child: const Text('Check confirmation'),
                ),
              ],
              if (trip.state == OpenRideTripState.confirmed) ...[
                SizedBox(
                  width: double.infinity,
                  child: OpenRideButton(
                    onDark: true,
                    onPressed: onStart,
                    child: const Text('Start trip'),
                  ),
                ),
                const SizedBox(height: 8),
                TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor: OpenRideColors.onDark,
                  ),
                  onPressed: onCancel,
                  child: const Text('Cancel ride'),
                ),
              ],
              if (trip.state == OpenRideTripState.inProgress)
                SizedBox(
                  width: double.infinity,
                  child: OpenRideButton(
                    onDark: true,
                    onPressed: onComplete,
                    child: const Text('Complete trip'),
                  ),
                ),
            ],
            const SizedBox(height: 24),
            const Divider(color: OpenRideColors.darkBorder),
            const SizedBox(height: 12),
            const Text(
              'One driver. One active trip.',
              style: TextStyle(color: OpenRideColors.onDark, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
