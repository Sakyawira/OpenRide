typedef Json = Map<String, dynamic>;

class Offer {
  Offer.fromJson(Json json)
    : id = json['id'] as String,
      providerId = json['providerId'] as String,
      providerName = json['providerName'] as String,
      version = json['version'] as int,
      pickup = json['pickup'] as String,
      destination = json['destination'] as String,
      payoutMinor = json['payoutMinor'] as int,
      currency = json['currency'] as String,
      pickupMinutes = json['pickupMinutes'] as int,
      tripMinutes = json['tripMinutes'] as int,
      distanceKm = (json['distanceKm'] as num).toDouble(),
      expiresAt = DateTime.parse(json['expiresAt'] as String);

  final String id, providerId, providerName, pickup, destination, currency;
  final int version, payoutMinor, pickupMinutes, tripMinutes;
  final double distanceKm;
  final DateTime expiresAt;
  bool get expired => !expiresAt.isAfter(DateTime.now());
  String get payout => '$currency ${(payoutMinor / 100).toStringAsFixed(2)}';
  String get requestIdentity => '$providerId/$id/$version';
}

class Booking {
  Booking.fromJson(Json json)
    : id = json['id'] as String,
      state = json['state'] as String,
      offer = Offer.fromJson(json['offer'] as Json),
      lastError = json['lastError'] as String?;
  final String id, state;
  final Offer offer;
  final String? lastError;
  bool get resolving => state == 'resolving' || state == 'preparing';
}

class ProviderStatus {
  ProviderStatus.fromJson(Json json)
    : id = json['id'] as String,
      name = json['name'] as String,
      available = json['available'] as bool;
  final String id, name;
  final bool available;
}

class DriverSnapshot {
  DriverSnapshot.fromJson(Json json)
    : offers = (json['offers'] as List)
          .map((value) => Offer.fromJson(value as Json))
          .toList(),
      providers = (json['providers'] as List)
          .map((value) => ProviderStatus.fromJson(value as Json))
          .toList(),
      activeBooking = json['activeBooking'] == null
          ? null
          : Booking.fromJson(json['activeBooking'] as Json);
  final List<Offer> offers;
  final List<ProviderStatus> providers;
  final Booking? activeBooking;
}
