typedef Json = Map<String, dynamic>;

class GeoPoint {
  const GeoPoint(this.latitude, this.longitude);
  GeoPoint.fromJson(Json json)
    : latitude = (json['latitude'] as num).toDouble(),
      longitude = (json['longitude'] as num).toDouble();
  final double latitude, longitude;
  Json toJson() => {'latitude': latitude, 'longitude': longitude};
}

class RideLocations {
  const RideLocations({required this.pickup, required this.destination});
  RideLocations.fromJson(Json json)
    : pickup = GeoPoint.fromJson(json['pickup'] as Json),
      destination = GeoPoint.fromJson(json['destination'] as Json);
  final GeoPoint pickup, destination;
  Json toJson() => {
    'pickup': pickup.toJson(),
    'destination': destination.toJson(),
  };
  bool sameAs(RideLocations? other) =>
      other != null &&
      pickup.latitude == other.pickup.latitude &&
      pickup.longitude == other.pickup.longitude &&
      destination.latitude == other.destination.latitude &&
      destination.longitude == other.destination.longitude;
}

class PriceTerms {
  PriceTerms.fromJson(Json json)
    : fareMinor = json['fareMinor'] as int,
      payoutMinor = json['payoutMinor'] as int,
      currency = json['currency'] as String,
      pricingVersion = json['pricingVersion'] as String;
  final int fareMinor, payoutMinor;
  final String currency, pricingVersion;
  String get fare => '$currency ${(fareMinor / 100).toStringAsFixed(2)}';
  Json toJson() => {
    'fareMinor': fareMinor,
    'payoutMinor': payoutMinor,
    'currency': currency,
    'pricingVersion': pricingVersion,
  };
}

class RideQuote {
  RideQuote.fromJson(Json json)
    : providerId = json['providerId'] as String,
      pickup = json['pickup'] as String,
      destination = json['destination'] as String,
      locations = json['locations'] == null
          ? null
          : RideLocations.fromJson(json['locations'] as Json),
      price = PriceTerms.fromJson(json['price'] as Json);
  final String providerId, pickup, destination;
  final RideLocations? locations;
  final PriceTerms price;
}

class RideRequest {
  RideRequest.fromJson(Json json)
    : id = json['id'] as String,
      providerId = json['providerId'] as String,
      providerName = json['providerName'] as String,
      pickup = json['pickup'] as String,
      destination = json['destination'] as String,
      locations = json['locations'] == null
          ? null
          : RideLocations.fromJson(json['locations'] as Json),
      status = json['status'] as String,
      fareMinor = json['fareMinor'] as int,
      currency = json['currency'] as String;
  final String id,
      providerId,
      providerName,
      pickup,
      destination,
      status,
      currency;
  final int fareMinor;
  final RideLocations? locations;
  String get fare => '$currency ${(fareMinor / 100).toStringAsFixed(2)}';
}

class RiderSnapshot {
  RiderSnapshot.fromJson(Json json)
    : requests = (json['requests'] as List)
          .map((value) => RideRequest.fromJson(value as Json))
          .toList(),
      providers = (json['providers'] as List)
          .map((value) => ProviderStatus.fromJson(value as Json))
          .toList();
  final List<RideRequest> requests;
  final List<ProviderStatus> providers;
}

class Offer {
  Offer.fromJson(Json json)
    : id = json['id'] as String,
      providerId = json['providerId'] as String,
      providerName = json['providerName'] as String,
      version = json['version'] as int,
      pickup = json['pickup'] as String,
      destination = json['destination'] as String,
      locations = json['locations'] == null
          ? null
          : RideLocations.fromJson(json['locations'] as Json),
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
  final RideLocations? locations;
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
