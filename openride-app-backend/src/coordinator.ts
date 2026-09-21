import { ProtocolError, type AcceptRequest, type TripAction } from '@sakyawira/openride-protocol';
import type { ProviderAdapter } from './ports';
import { publicBooking } from './domain';
import type { BookingRecord } from './domain';
import type { BookingRepository } from './ports';

const DEFINITIVE_REJECTIONS = new Set([
  'OFFER_UNAVAILABLE',
  'OFFER_EXPIRED',
  'OFFER_VERSION_MISMATCH',
]);

export class Coordinator {
  private readonly running = new Map<string, Promise<BookingRecord>>();
  constructor(
    readonly store: BookingRepository,
    readonly providers: ProviderAdapter[]
  ) {}

  private provider(id: string): ProviderAdapter {
    const provider = this.providers.find((candidate) => candidate.id === id);
    if (!provider) throw new ProtocolError('UNKNOWN_PROVIDER', 'Provider is not registered.', 404);
    return provider;
  }

  private match(record: BookingRecord, request: AcceptRequest): BookingRecord {
    if (
      record.providerId !== request.providerId ||
      record.offer.id !== request.offerId ||
      record.offer.version !== request.offerVersion
    ) {
      throw new ProtocolError(
        'IDEMPOTENCY_CONFLICT',
        'This request key was already used for different offer terms.'
      );
    }
    return record;
  }

  async accept(driverId: string, key: string, request: AcceptRequest): Promise<BookingRecord> {
    const previous = await this.store.byKey(driverId, key);
    if (previous) return this.match(previous, request);
    const offer = await this.provider(request.providerId).getOffer(request.offerId);
    if (offer.providerId !== request.providerId || offer.id !== request.offerId)
      throw new ProtocolError(
        'INVALID_PROVIDER_RESPONSE',
        'Provider returned mismatched offer.',
        502
      );
    if (offer.version !== request.offerVersion)
      throw new ProtocolError(
        'OFFER_VERSION_MISMATCH',
        'Offer terms have changed. Refresh offers.'
      );
    if (Date.parse(offer.expiresAt) <= Date.now())
      throw new ProtocolError('OFFER_EXPIRED', 'This offer has expired.');
    const record = this.match(await this.store.claim(driverId, key, offer), request);
    return this.reconcile(record.id);
  }

  async owned(driverId: string, id: string): Promise<BookingRecord> {
    const record = await this.store.get(id);
    if (record.driverId !== driverId)
      throw new ProtocolError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    return record;
  }

  async action(driverId: string, id: string, action: TripAction): Promise<BookingRecord> {
    await this.owned(driverId, id);
    const target = { start: 'in_progress', complete: 'completed', cancel: 'cancelled' } as const;
    const source = { start: 'confirmed', complete: 'in_progress', cancel: 'confirmed' } as const;
    const record = await this.store.change(id, (previous) => {
      if (
        previous.pendingAction === action ||
        (previous.pendingAction === null && previous.state === target[action])
      )
        return previous;
      if (previous.pendingAction !== null || previous.state !== source[action])
        throw new ProtocolError('INVALID_TRANSITION', `Cannot ${action} this booking yet.`);
      return { ...previous, pendingAction: action };
    });
    if (!record.pendingAction) return record;
    return this.reconcile(id);
  }

  async reconcile(id: string): Promise<BookingRecord> {
    const existing = this.running.get(id);
    if (existing) return existing;
    const operation = this.drive(id);
    this.running.set(id, operation);
    try {
      return await operation;
    } finally {
      this.running.delete(id);
    }
  }

  private async drive(id: string): Promise<BookingRecord> {
    let record = await this.store.get(id);
    while (record.pendingAction) {
      const action = record.pendingAction;
      try {
        const provider = this.provider(record.providerId);
        const response =
          action === 'prepare'
            ? await provider.prepare({
                bookingId: id,
                driverId: record.driverId,
                offerId: record.offer.id,
                offerVersion: record.offer.version,
                token: record.token,
              })
            : await provider.apply(id, record.token, action);
        const expected = {
          prepare: 'prepared',
          commit: 'confirmed',
          start: 'in_progress',
          complete: 'completed',
          cancel: 'cancelled',
        } as const;
        if (response.bookingId !== id || response.state !== expected[action])
          throw new ProtocolError(
            'INVALID_PROVIDER_RESPONSE',
            'Provider response requires reconciliation.',
            502
          );
        record = await this.store.change(id, (previous) =>
          // Another worker may have already advanced this booking. A delayed
          // acknowledgement must never restore an older state or pending command.
          previous.version !== record.version
            ? previous
            : action === 'prepare'
              ? // Commit intent is durable BEFORE sending the external commit command.
                { ...previous, pendingAction: 'commit', state: 'preparing', lastError: null }
              : { ...previous, pendingAction: null, state: expected[action], lastError: null }
        );
      } catch (error) {
        // Only a definitive prepare rejection proves no reservation exists. An
        // ambiguous timeout, including after commit, MUST retain the driver claim.
        const rejected =
          action === 'prepare' &&
          error instanceof ProtocolError &&
          DEFINITIVE_REJECTIONS.has(error.code);
        const message =
          rejected && error instanceof Error
            ? error.message
            : 'Waiting for the provider to confirm the outcome. Your driver reservation is protected.';
        record = await this.store.change(id, (previous) => {
          if (previous.version !== record.version) return previous;
          const state = rejected ? 'rejected' : 'resolving';
          if (previous.state === state && previous.lastError === message) return previous;
          return {
            ...previous,
            state,
            pendingAction: rejected ? null : previous.pendingAction,
            lastError: message,
          };
        });
        return record;
      }
    }
    return record;
  }

  async snapshot(driverId: string) {
    const feeds = await Promise.all(
      this.providers.map(async (provider) => {
        try {
          return {
            id: provider.id,
            name: provider.name,
            available: true,
            offers: await provider.offers(),
          };
        } catch {
          return { id: provider.id, name: provider.name, available: false, offers: [] };
        }
      })
    );
    const active = await this.store.active(driverId);
    return {
      driverId,
      activeBooking: active ? publicBooking(active) : null,
      offers: feeds.flatMap((feed) => feed.offers),
      providers: feeds.map((feed) => ({ id: feed.id, name: feed.name, available: feed.available })),
    };
  }

  async recover(): Promise<void> {
    for (const record of await this.store.pending()) await this.reconcile(record.id);
  }

  async idle(): Promise<void> {
    await Promise.all(this.running.values());
  }
}
