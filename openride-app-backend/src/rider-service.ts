import {
  ProtocolError,
  type CreateRideRequest,
  type RideRequest,
  type QuoteInput,
  type RideQuote,
  type RiderSnapshot,
} from '@sakyawira/openride-protocol';
import type { RiderProviderAdapter } from './ports';

/** The rider facade depends on the provider protocol, not its storage or frontend. */
export class RiderService {
  constructor(private readonly providers: RiderProviderAdapter[]) {}

  private provider(id: string): RiderProviderAdapter {
    const provider = this.providers.find((candidate) => candidate.id === id);
    if (!provider) throw new ProtocolError('UNKNOWN_PROVIDER', 'Provider is not registered.', 404);
    return provider;
  }

  async quote(input: QuoteInput): Promise<RideQuote> {
    return this.provider(input.providerId).quote({
      pickup: input.pickup,
      destination: input.destination,
      locations: input.locations,
    });
  }

  async request(riderId: string, key: string, input: CreateRideRequest): Promise<RideRequest> {
    return this.provider(input.providerId).requestRide({
      riderId,
      requestKey: key,
      pickup: input.pickup,
      destination: input.destination,
      locations: input.locations,
      expectedPrice: input.expectedPrice,
    });
  }

  async ride(riderId: string, providerId: string, id: string): Promise<RideRequest> {
    return this.provider(providerId).ride(riderId, id);
  }

  async snapshot(riderId: string): Promise<RiderSnapshot> {
    const results = await Promise.all(
      this.providers.map(async (provider) => {
        try {
          return {
            id: provider.id,
            name: provider.name,
            available: true,
            requests: await provider.rides(riderId),
          };
        } catch {
          return { id: provider.id, name: provider.name, available: false, requests: [] };
        }
      })
    );
    return {
      requests: results
        .flatMap((result) => result.requests)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      providers: results.map(({ id, name, available }) => ({ id, name, available })),
    };
  }
}
