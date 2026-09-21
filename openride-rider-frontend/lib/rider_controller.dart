import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import 'package:openride_protocol/openride_protocol.dart';

class RiderController extends ChangeNotifier {
  RiderController(this.api);
  OpenRideApi api;
  RiderSnapshot? snapshot;
  RideQuote? quote;
  String? error, notice;
  bool busy = false, connected = false, _disposed = false;
  Timer? _timer;
  Future<void>? _refresh;
  final Map<String, String> _keys = {};

  void start() {
    unawaited(refresh());
    _timer ??= Timer.periodic(
      const Duration(seconds: 2),
      (_) => unawaited(refresh()),
    );
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> refresh() async {
    if (_refresh != null) return _refresh;
    _refresh = _load();
    try {
      await _refresh;
    } finally {
      _refresh = null;
    }
  }

  Future<void> _load() async {
    try {
      snapshot = await api.riderSnapshot();
      connected = true;
      error = null;
    } catch (_) {
      connected = false;
      error =
          'The service may be waking up. Your requests stay saved; retry in a moment.';
    }
    _notify();
  }

  Future<void> getQuote(
    String provider,
    String pickup,
    String destination, {
    RideLocations? locations,
  }) async {
    if (busy) return;
    busy = true;
    quote = null;
    notice = null;
    _notify();
    try {
      quote = await api.quote(
        provider,
        pickup.trim(),
        destination.trim(),
        locations: locations,
      );
    } catch (failure) {
      notice = failure is ApiException
          ? failure.message
          : 'Could not get a price. Try again.';
    } finally {
      busy = false;
      _notify();
    }
  }

  Future<bool> request(
    String provider,
    String pickup,
    String destination, {
    PriceTerms? expectedPrice,
    RideLocations? locations,
  }) async {
    if (busy) return false;
    busy = true;
    notice = null;
    _notify();
    final identity =
        '$provider\n${pickup.trim()}\n${destination.trim()}\n${locations?.toJson()}';
    final key = _keys.putIfAbsent(identity, () => const Uuid().v4());
    var succeeded = false;
    try {
      await api.requestRide(
        provider,
        pickup.trim(),
        destination.trim(),
        key,
        expectedPrice: expectedPrice,
        locations: locations,
      );
      quote = null;
      _keys.remove(identity);
      succeeded = true;
      notice = 'Request sent. A driver in either app can accept your ride.';
    } catch (failure) {
      if (failure is ApiException && failure.code == 'PRICE_CHANGED') {
        quote = null;
      }
      notice = failure is ApiException
          ? failure.message
          : 'The response was interrupted. Retry this route to check the same request.';
    } finally {
      await _refresh;
      await refresh();
      busy = false;
      _notify();
    }
    return succeeded;
  }

  Future<void> connect(String url, String token) async {
    await _refresh;
    api.close();
    api = OpenRideApi(baseUrl: url, token: token);
    snapshot = null;
    quote = null;
    _keys.clear();
    await refresh();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    api.close();
    super.dispose();
  }
}
