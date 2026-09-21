import { z } from 'zod';
import {
  OFFER_SCHEMA,
  PROVIDER_RESERVATION_SCHEMA,
  RIDE_REQUEST_SCHEMA,
  RIDE_QUOTE_SCHEMA,
  type RideInput,
  type RideQuote,
  ProtocolError,
  type Offer,
  type PrepareRequest,
  type ProviderAction,
  type ProviderReservation,
  type ProviderRideInput,
  type RideRequest,
} from '@sakyawira/openride-protocol';
import type { ProviderAdapter, RiderProviderAdapter } from './ports';

const ERROR_SCHEMA = z.object({ code: z.string(), message: z.string() });

export class HttpProvider implements ProviderAdapter, RiderProviderAdapter {
  constructor(
    readonly id: string,
    readonly name: string,
    private readonly url: string,
    private readonly token: string
  ) {}

  private async request(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.url}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(2500),
      redirect: 'error',
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const parsed = ERROR_SCHEMA.safeParse(data);
      if ((response.status === 409 || response.status === 404) && parsed.success) {
        throw new ProtocolError(parsed.data.code, parsed.data.message, response.status);
      }
      throw new ProtocolError('PROVIDER_UNAVAILABLE', 'Provider is unavailable.', 502);
    }
    return data;
  }

  async offers(): Promise<Offer[]> {
    const offers = OFFER_SCHEMA.array().parse(await this.request('/v0.1/offers'));
    if (offers.some((offer) => offer.providerId !== this.id))
      throw new ProtocolError('INVALID_PROVIDER_RESPONSE', 'Provider identity mismatch.', 502);
    return offers;
  }
  async getOffer(id: string): Promise<Offer> {
    return OFFER_SCHEMA.parse(await this.request(`/v0.1/offers/${encodeURIComponent(id)}`));
  }
  async prepare(request: PrepareRequest): Promise<ProviderReservation> {
    return PROVIDER_RESERVATION_SCHEMA.parse(await this.request('/v0.1/reservations', request));
  }
  async apply(id: string, token: string, action: ProviderAction): Promise<ProviderReservation> {
    return PROVIDER_RESERVATION_SCHEMA.parse(
      await this.request(`/v0.1/reservations/${encodeURIComponent(id)}/actions`, { token, action })
    );
  }
  async seed(): Promise<void> {
    await this.request('/demo/offers', {});
  }

  async quote(input: RideInput): Promise<RideQuote> {
    const quote = RIDE_QUOTE_SCHEMA.parse(await this.request('/v0.1/ride-quotes', input));
    if (
      quote.providerId !== this.id ||
      quote.pickup !== input.pickup ||
      quote.destination !== input.destination ||
      JSON.stringify(quote.locations) !== JSON.stringify(input.locations)
    )
      throw new ProtocolError('INVALID_PROVIDER_RESPONSE', 'Quote identity mismatch.', 502);
    return quote;
  }

  async requestRide(input: ProviderRideInput): Promise<RideRequest> {
    return RIDE_REQUEST_SCHEMA.parse(await this.request('/v0.1/rider-requests', input));
  }
  async ride(riderId: string, id: string): Promise<RideRequest> {
    return RIDE_REQUEST_SCHEMA.parse(
      await this.request(
        `/v0.1/rider-requests/${encodeURIComponent(id)}?riderId=${encodeURIComponent(riderId)}`
      )
    );
  }
  async rides(riderId: string): Promise<RideRequest[]> {
    return RIDE_REQUEST_SCHEMA.array().parse(
      await this.request(`/v0.1/rider-requests?riderId=${encodeURIComponent(riderId)}`)
    );
  }
}
