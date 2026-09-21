import 'package:flutter/material.dart';
import 'branding.dart';
import 'view_data.dart';

class OpenRideOfferCard extends StatelessWidget {
  const OpenRideOfferCard({super.key, required this.offer, this.onAccept});
  final RideOfferData offer;
  final VoidCallback? onAccept;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              OpenRideBadge(
                offer.providerName,
                Icons.local_taxi_outlined,
                muted: offer.alternateProvider,
              ),
              Text(
                '${offer.pickupMinutes} min to pickup',
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Icon(
                    Icons.radio_button_checked,
                    size: 17,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                  SizedBox(height: 7),
                  SizedBox(height: 16, child: VerticalDivider(width: 17)),
                  SizedBox(height: 7),
                  Icon(
                    Icons.location_on_outlined,
                    size: 19,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      offer.pickup,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      offer.destination,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            '${offer.tripMinutes} min trip  ·  ${offer.distanceKm.toStringAsFixed(1)} km',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 20),
          const Divider(height: 1),
          const SizedBox(height: 18),
          Wrap(
            spacing: 24,
            runSpacing: 14,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    offer.payout,
                    style: TextStyle(
                      fontSize: 25,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                  Text(
                    'Driver payout',
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
              OpenRideButton(
                onPressed: onAccept,
                icon: const Icon(Icons.arrow_forward, size: 18),
                child: const Text('Accept ride'),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class OpenRideBadge extends StatelessWidget {
  const OpenRideBadge(this.text, this.icon, {super.key, this.muted = false});
  final String text;
  final IconData icon;
  final bool muted;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(
      color: muted
          ? Theme.of(context).colorScheme.surfaceContainerHighest
          : Theme.of(context).colorScheme.primaryContainer,
      borderRadius: BorderRadius.circular(8),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: Theme.of(context).colorScheme.onSurface),
        const SizedBox(width: 7),
        Flexible(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
        ),
      ],
    ),
  );
}

class OpenRideNotice extends StatelessWidget {
  const OpenRideNotice({
    super.key,
    required this.text,
    this.warning = false,
    this.action,
  });
  final String text;
  final bool warning;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: warning
          ? Theme.of(context).colorScheme.tertiaryContainer
          : Theme.of(context).colorScheme.secondaryContainer,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        Icon(
          warning ? Icons.wifi_off : Icons.info_outline,
          size: 20,
          color: warning
              ? Theme.of(context).colorScheme.onTertiaryContainer
              : Theme.of(context).colorScheme.onSecondaryContainer,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              color: warning
                  ? Theme.of(context).colorScheme.onTertiaryContainer
                  : Theme.of(context).colorScheme.onSecondaryContainer,
            ),
          ),
        ),
        ?action,
      ],
    ),
  );
}

class OpenRideButton extends StatelessWidget {
  const OpenRideButton({
    super.key,
    required this.child,
    this.onPressed,
    this.icon,
    this.onDark = false,
  });
  final Widget child;
  final Widget? icon;
  final VoidCallback? onPressed;
  final bool onDark;
  @override
  Widget build(BuildContext context) {
    final style = onDark
        ? FilledButton.styleFrom(
            backgroundColor: OpenRideColors.aqua,
            foregroundColor: OpenRideColors.deepNavy,
            disabledBackgroundColor: OpenRideColors.darkBorder,
            disabledForegroundColor: OpenRideColors.onDark,
          )
        : null;
    return icon == null
        ? FilledButton(onPressed: onPressed, style: style, child: child)
        : FilledButton.icon(
            onPressed: onPressed,
            style: style,
            icon: icon,
            label: child,
          );
  }
}
