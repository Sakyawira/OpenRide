/// Presentation values only: no HTTP clients, booking commands or persistence.
class RideOfferData {
  const RideOfferData({
    required this.providerName,
    required this.pickup,
    required this.destination,
    required this.payout,
    required this.pickupMinutes,
    required this.tripMinutes,
    required this.distanceKm,
    this.alternateProvider = false,
  });
  final String providerName, pickup, destination, payout;
  final int pickupMinutes, tripMinutes;
  final double distanceKm;
  final bool alternateProvider;
}

enum OpenRideTripState { confirming, confirmed, inProgress }

class RideTripData {
  const RideTripData({
    required this.providerName,
    required this.pickup,
    required this.destination,
    required this.payout,
    required this.state,
    this.lastError,
  });
  final String providerName, pickup, destination, payout;
  final OpenRideTripState state;
  final String? lastError;
  bool get resolving => state == OpenRideTripState.confirming;
}
