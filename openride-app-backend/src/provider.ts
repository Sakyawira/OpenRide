import { randomUUID } from 'node:crypto';
import {
  ProtocolError,
  PRICE_TERMS_SCHEMA,
  type RideInput,
  type RideQuote,
  type PriceTerms,
  type Offer,
  type PrepareRequest,
  type ProviderAction,
  type ProviderReservation,
  type ProviderRideInput,
  type RideRequest,
} from '@sakyawira/openride-protocol';
import type { ReservationRecord, RideRequestRecord } from './domain';
import type {
  ProviderAdapter,
  ProviderRepository,
  RiderProviderAdapter,
  RidePricing,
} from './ports';
import { demoPricing } from './pricing';

/** Provider behavior is shared by every storage adapter. Offers are immutable. */
export class DemoProvider implements ProviderAdapter, RiderProviderAdapter {
  constructor(
    readonly id: string,
    readonly name: string,
    private readonly store: ProviderRepository,
    private readonly pricing: RidePricing = demoPricing(id)
  ) {}

  async offers(): Promise<Offer[]> {
    return this.store.availableOffers(new Date());
  }

  async quote(input: RideInput): Promise<RideQuote> {
    return {
      pickup: input.pickup,
      destination: input.destination,
      locations: input.locations,
      providerId: this.id,
      price: PRICE_TERMS_SCHEMA.parse(await this.pricing.quote(input)),
    };
  }

  private samePrice(first: PriceTerms, second: PriceTerms): boolean {
    return (
      first.fareMinor === second.fareMinor &&
      first.payoutMinor === second.payoutMinor &&
      first.currency === second.currency &&
      first.pricingVersion === second.pricingVersion
    );
  }

  async requestRide(input: ProviderRideInput): Promise<RideRequest> {
    let record = await this.store.rideByKey(input.riderId, input.requestKey);
    if (!record) {
      const { price } = await this.quote(input);
      if (input.expectedPrice && !this.samePrice(input.expectedPrice, price))
        throw new ProtocolError(
          'PRICE_CHANGED',
          'The price changed. Review a new quote before requesting.'
        );
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      record = await this.store.createRide({
        id,
        riderId: input.riderId,
        requestKey: input.requestKey,
        createdAt,
        price,
        offer: {
          id,
          providerId: this.id,
          providerName: this.name,
          version: 1,
          pickup: input.pickup,
          destination: input.destination,
          locations: input.locations,
          payoutMinor: price.payoutMinor,
          currency: price.currency,
          pickupMinutes: 4,
          tripMinutes: 12,
          distanceKm: 5,
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        },
      });
    }
    if (
      record.offer.pickup !== input.pickup ||
      record.offer.destination !== input.destination ||
      JSON.stringify(record.offer.locations) !== JSON.stringify(input.locations)
    )
      throw new ProtocolError(
        'IDEMPOTENCY_CONFLICT',
        'This request key was already used for another route.'
      );
    if (input.expectedPrice && record.price && !this.samePrice(input.expectedPrice, record.price))
      throw new ProtocolError(
        'IDEMPOTENCY_CONFLICT',
        'This request key was already used with different pricing.'
      );
    return this.publicRide(record);
  }

  async ride(riderId: string, id: string): Promise<RideRequest> {
    const record = await this.store.getRide(riderId, id);
    if (!record) throw new ProtocolError('RIDE_NOT_FOUND', 'Ride request not found.', 404);
    return this.publicRide(record);
  }

  async rides(riderId: string): Promise<RideRequest[]> {
    return Promise.all(
      (await this.store.listRides(riderId)).map((record) => this.publicRide(record))
    );
  }

  private async publicRide(record: RideRequestRecord): Promise<RideRequest> {
    const reservation = await this.store.reservationForOffer(record.offer.id);
    const status = reservation
      ? reservation.state === 'prepared'
        ? 'matching'
        : reservation.state === 'cancelled'
          ? 'searching'
          : reservation.state
      : Date.parse(record.offer.expiresAt) <= Date.now()
        ? 'expired'
        : 'searching';
    return {
      id: record.id,
      providerId: this.id,
      providerName: this.name,
      pickup: record.offer.pickup,
      destination: record.offer.destination,
      locations: record.offer.locations,
      fareMinor: record.price?.fareMinor ?? record.offer.payoutMinor,
      currency: record.offer.currency,
      createdAt: record.createdAt,
      expiresAt: record.offer.expiresAt,
      status,
      bookingId: reservation?.bookingId ?? null,
    };
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
