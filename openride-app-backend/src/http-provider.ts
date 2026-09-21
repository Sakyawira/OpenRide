import { z } from 'zod';
import {
  OFFER_SCHEMA,
  PROVIDER_RESERVATION_SCHEMA,
  ProtocolError,
  type Offer,
  type PrepareRequest,
  type ProviderAction,
  type ProviderReservation,
} from '@sakyawira/openride-protocol';
import type { ProviderAdapter } from './ports';

const ERROR_SCHEMA = z.object({ code: z.string(), message: z.string() });

export class HttpProvider implements ProviderAdapter {
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
}
