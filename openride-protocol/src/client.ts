import {
  BOOKING_SCHEMA,
  DRIVER_SNAPSHOT_SCHEMA,
  RIDER_SNAPSHOT_SCHEMA,
  RIDE_REQUEST_SCHEMA,
  RIDE_QUOTE_SCHEMA,
  type QuoteInput,
  type RideQuote,
  type Booking,
  type CreateRideRequest,
  type DriverSnapshot,
  type Offer,
  type RiderSnapshot,
  type RideRequest,
  type TripAction,
} from './index.js';

export class OpenRideClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** Optional fetch client. The interoperability contract is HTTP/JSON, not this SDK. */
export class OpenRideClient {
  constructor(
    readonly baseUrl: string,
    private readonly token: string,
    private readonly transport: typeof fetch = globalThis.fetch.bind(globalThis)
  ) {}

  private async request(path: string, body?: unknown, key?: string): Promise<unknown> {
    const response = await this.transport(new URL(path, this.baseUrl), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(key ? { 'idempotency-key': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('The service is starting or unavailable. Retry in a moment.');
    }
    const result: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof result === 'object' &&
        result !== null &&
        'message' in result &&
        typeof result.message === 'string'
          ? result.message
          : `Request failed (${response.status}).`;
      const code =
        typeof result === 'object' &&
        result !== null &&
        'code' in result &&
        typeof result.code === 'string'
          ? result.code
          : 'REQUEST_FAILED';
      throw new OpenRideClientError(message, code, response.status);
    }
    return result;
  }

  async driverSnapshot(): Promise<DriverSnapshot> {
    return DRIVER_SNAPSHOT_SCHEMA.parse(await this.request('/v0.1/snapshot'));
  }
  async accept(offer: Offer, key: string): Promise<Booking> {
    return BOOKING_SCHEMA.parse(
      await this.request(
        '/v0.1/bookings',
        {
          providerId: offer.providerId,
          offerId: offer.id,
          offerVersion: offer.version,
        },
        key
      )
    );
  }
  async action(id: string, action: TripAction): Promise<Booking> {
    return BOOKING_SCHEMA.parse(
      await this.request(`/v0.1/bookings/${encodeURIComponent(id)}/actions`, { action })
    );
  }
  async reconcile(id: string): Promise<Booking> {
    return BOOKING_SCHEMA.parse(
      await this.request(`/v0.1/bookings/${encodeURIComponent(id)}/reconcile`, {})
    );
  }
  async riderSnapshot(): Promise<RiderSnapshot> {
    return RIDER_SNAPSHOT_SCHEMA.parse(await this.request('/v0.1/rider/snapshot'));
  }
  async quote(input: QuoteInput): Promise<RideQuote> {
    return RIDE_QUOTE_SCHEMA.parse(await this.request('/v0.1/rider/quotes', input));
  }
  async requestRide(input: CreateRideRequest, key: string): Promise<RideRequest> {
    return RIDE_REQUEST_SCHEMA.parse(await this.request('/v0.1/rider/requests', input, key));
  }
  async ride(providerId: string, id: string): Promise<RideRequest> {
    return RIDE_REQUEST_SCHEMA.parse(
      await this.request(
        `/v0.1/rider/requests/${encodeURIComponent(providerId)}/${encodeURIComponent(id)}`
      )
    );
  }
}
