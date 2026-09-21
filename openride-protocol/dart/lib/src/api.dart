import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.code});
  final String? code;
  final String message;
  @override
  String toString() => message;
}

class OpenRideApi {
  OpenRideApi({required this.baseUrl, required this.token, http.Client? client})
    : _client = client ?? http.Client();
  final String baseUrl, token;
  final http.Client _client;

  Future<Json> _request(String path, {Json? body, String? key}) async {
    final uri = Uri.parse(baseUrl).resolve(path);
    final headers = {
      'authorization': 'Bearer $token',
      if (body != null) 'content-type': 'application/json',
      'idempotency-key': ?key,
    };
    final response =
        await (body == null
                ? _client.get(uri, headers: headers)
                : _client.post(uri, headers: headers, body: jsonEncode(body)))
            .timeout(const Duration(seconds: 12));
    final data = jsonDecode(response.body) as Json;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        data['message'] as String? ??
            'The service could not complete this request.',
        code: data['code'] as String?,
      );
    }
    return data;
  }

  Future<DriverSnapshot> snapshot() async =>
      DriverSnapshot.fromJson(await _request('/v0.1/snapshot'));
  Future<RiderSnapshot> riderSnapshot() async =>
      RiderSnapshot.fromJson(await _request('/v0.1/rider/snapshot'));
  Future<RideQuote> quote(
    String providerId,
    String pickup,
    String destination, {
    RideLocations? locations,
  }) async => RideQuote.fromJson(
    await _request(
      '/v0.1/rider/quotes',
      body: {
        'providerId': providerId,
        if (locations != null) 'locations': locations.toJson(),
        'pickup': pickup,
        'destination': destination,
      },
    ),
  );
  Future<RideRequest> requestRide(
    String providerId,
    String pickup,
    String destination,
    String key, {
    PriceTerms? expectedPrice,
    RideLocations? locations,
  }) async => RideRequest.fromJson(
    await _request(
      '/v0.1/rider/requests',
      key: key,
      body: {
        'providerId': providerId,
        if (locations != null) 'locations': locations.toJson(),
        if (expectedPrice != null) 'expectedPrice': expectedPrice.toJson(),
        'pickup': pickup,
        'destination': destination,
      },
    ),
  );
  Future<Booking> accept(Offer offer, String key) async => Booking.fromJson(
    await _request(
      '/v0.1/bookings',
      key: key,
      body: {
        'providerId': offer.providerId,
        'offerId': offer.id,
        'offerVersion': offer.version,
      },
    ),
  );
  Future<Booking> action(Booking booking, String action) async =>
      Booking.fromJson(
        await _request(
          '/v0.1/bookings/${booking.id}/actions',
          body: {'action': action},
        ),
      );
  Future<Booking> reconcile(Booking booking) async => Booking.fromJson(
    await _request('/v0.1/bookings/${booking.id}/reconcile', body: {}),
  );
  Future<void> seed() async {
    final result = await _request('/demo/offers', body: {});
    if (result['created'] != result['total']) {
      throw ApiException(
        'Some providers are offline. Available providers received new offers.',
      );
    }
  }

  void close() => _client.close();
}
