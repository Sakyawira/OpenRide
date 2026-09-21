import { randomUUID } from 'node:crypto';
import {
  ProtocolError,
  type Offer,
  type PrepareRequest,
  type ProviderAction,
  type ProviderReservation,
} from '@sakyawira/openride-protocol';
import type { ReservationRecord } from './domain';
import type { ProviderAdapter, ProviderRepository } from './ports';

/** Provider behavior is shared by every storage adapter. Offers are immutable. */
export class DemoProvider implements ProviderAdapter {
  constructor(
    readonly id: string,
    readonly name: string,
    private readonly store: ProviderRepository
  ) {}

  async offers(): Promise<Offer[]> {
    return this.store.availableOffers(new Date());
  }

  async getOffer(id: string): Promise<Offer> {
    const offer = await this.store.getOffer(id);
    if (!offer)
      throw new ProtocolError('OFFER_UNAVAILABLE', 'This offer is no longer available.', 404);
    return offer;
  }

  private match(record: ReservationRecord, request: PrepareRequest): ProviderReservation {
    if (
      record.token !== request.token ||
      record.driverId !== request.driverId ||
      record.offerId !== request.offerId ||
      record.offerVersion !== request.offerVersion
    ) {
      throw new ProtocolError('RESERVATION_MISMATCH', 'Reservation identity does not match.');
    }
    return { bookingId: record.bookingId, state: record.state };
  }

  async prepare(request: PrepareRequest): Promise<ProviderReservation> {
    // Replays must work even after the original offer expires or is consumed.
    const existing = await this.store.getReservation(request.bookingId);
    if (existing) return this.match(existing, request);
    const offer = await this.getOffer(request.offerId);
    if (offer.version !== request.offerVersion)
      throw new ProtocolError(
        'OFFER_VERSION_MISMATCH',
        'Offer terms have changed. Refresh offers.'
      );
    if (Date.parse(offer.expiresAt) <= Date.now())
      throw new ProtocolError('OFFER_EXPIRED', 'This offer has expired.');
    return this.match(
      await this.store.claimReservation({ ...request, state: 'prepared' }),
      request
    );
  }

  async apply(id: string, token: string, action: ProviderAction): Promise<ProviderReservation> {
    const record = await this.store.changeReservation(id, (previous) => {
      if (previous.token !== token)
        throw new ProtocolError('RESERVATION_NOT_FOUND', 'Reservation not found.', 404);
      const target = {
        commit: 'confirmed',
        start: 'in_progress',
        complete: 'completed',
        cancel: 'cancelled',
      } as const;
      const source = {
        commit: 'prepared',
        start: 'confirmed',
        complete: 'in_progress',
        cancel: 'confirmed',
      } as const;
      if (previous.state === target[action]) return previous;
      if (previous.state !== source[action])
        throw new ProtocolError(
          'INVALID_TRANSITION',
          `Cannot ${action} a ${previous.state} reservation.`
        );
      return { ...previous, state: target[action] };
    });
    return { bookingId: record.bookingId, state: record.state };
  }

  async seed(): Promise<void> {
    const routes =
      this.id === 'harbour'
        ? ([
            ['Britomart', 'Ponsonby Central', 1860, 4, 14, 4.2],
            ['Wynyard Quarter', 'Mount Eden Village', 2450, 6, 19, 6.8],
          ] as const)
        : ([
            ['Commercial Bay', 'Newmarket', 2140, 3, 16, 5.1],
            ['Parnell Village', 'Mission Bay', 2870, 7, 22, 8.4],
          ] as const);
    const offers: Offer[] = [];
    for (const [
      pickup,
      destination,
      payoutMinor,
      pickupMinutes,
      tripMinutes,
      distanceKm,
    ] of routes) {
      const offer: Offer = {
        id: randomUUID(),
        providerId: this.id,
        providerName: this.name,
        version: 1,
        pickup,
        destination,
        payoutMinor,
        currency: 'NZD',
        pickupMinutes,
        tripMinutes,
        distanceKm,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      };
      offers.push(offer);
    }
    await this.store.addOffers(offers);
  }

  async seedIfEmpty(): Promise<void> {
    if (!(await this.store.hasOffers())) await this.seed();
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
