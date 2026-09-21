import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import 'api.dart';
import 'models.dart';

class DriverController extends ChangeNotifier {
  DriverController(this.api);
  OpenRideApi api;
  DriverSnapshot? snapshot;
  String? error, notice;
  bool busy = false;
  bool connected = false;
  bool _disposed = false;
  Timer? _timer;
  Future<void>? _refresh;
  final Map<String, String> _requestKeys = {};

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
      final next = await api.snapshot();
      final previous = snapshot?.activeBooking;
      if (previous != null && next.activeBooking?.id != previous.id) {
        _requestKeys.remove(previous.offer.requestIdentity);
      }
      snapshot = next;
      connected = true;
      error = null;
    } catch (failure) {
      connected = false;
      error = failure is ApiException
          ? failure.message
          : 'Cannot reach OpenRide. Check the connection and retry. Existing reservations stay protected.';
    }
    _notify();
  }

  Future<void> _mutate(Future<void> Function() operation) async {
    if (busy) return;
    busy = true;
    notice = null;
    _notify();
    try {
      await operation();
    } catch (failure) {
      notice = failure is ApiException
          ? failure.message
          : 'The response was interrupted. Refresh to check the outcome before trying again.';
    } finally {
      // Finish any earlier poll first so it cannot overwrite this action's result.
      await _refresh;
      await refresh();
      busy = false;
      _notify();
    }
  }

  Future<void> accept(Offer offer) => _mutate(() async {
    final key = _requestKeys.putIfAbsent(
      offer.requestIdentity,
      () => const Uuid().v4(),
    );
    final booking = await api.accept(offer, key);
    if (['rejected', 'cancelled', 'completed'].contains(booking.state)) {
      _requestKeys.remove(offer.requestIdentity);
      notice =
          booking.lastError ??
          'That earlier request has already ended. Choose an available ride to make a new booking.';
      return;
    }
    notice = booking.state == 'rejected'
        ? booking.lastError
        : booking.resolving
        ? 'Your reservation is protected while the provider confirms.'
        : 'Ride accepted. You are reserved with ${offer.providerName}.';
  });

  Future<void> action(Booking booking, String action) => _mutate(() async {
    final updated = await api.action(booking, action);
    if (updated.state == 'cancelled' || updated.state == 'completed') {
      _requestKeys.remove(booking.offer.requestIdentity);
    }
    notice = updated.resolving
        ? 'Waiting for confirmation. Your reservation stays protected.'
        : switch (updated.state) {
            'completed' => 'Trip complete. You are ready for your next ride.',
            'cancelled' => 'Ride cancelled. You are available again.',
            _ => 'Trip started. Have a good journey.',
          };
  });

  Future<void> reconcile(Booking booking) => _mutate(() async {
    await api.reconcile(booking);
  });
  Future<void> seed() => _mutate(() async {
    await api.seed();
    notice = 'New demo offers are ready.';
  });

  Future<void> connect(String url, String token) async {
    await _refresh;
    api.close();
    api = OpenRideApi(baseUrl: url, token: token);
    snapshot = null;
    connected = false;
    _requestKeys.clear();
    notice = null;
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
