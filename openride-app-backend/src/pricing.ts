import type { PriceTerms, RideInput } from '@sakyawira/openride-protocol';
import type { RidePricing } from './ports';

/** OpenRide's demo is a flat fare with the full fare paid to the driver. */
export class FlatFarePricing implements RidePricing {
  constructor(private readonly terms: PriceTerms) {}
  async quote(_input: RideInput): Promise<PriceTerms> {
    return { ...this.terms };
  }
}

/** MockRide demonstrates a separate formula and fee, using synthetic route metrics. */
export class MeteredDemoPricing implements RidePricing {
  async quote(_input: RideInput): Promise<PriceTerms> {
    const distanceKm = 5;
    const tripMinutes = 12;
    const fareMinor = 600 + distanceKm * 150 + tripMinutes * 25;
    return {
      fareMinor,
      payoutMinor: fareMinor - 150,
      currency: 'NZD',
      pricingVersion: 'mockride-demo-v1',
    };
  }
}

export function demoPricing(providerId: string): RidePricing {
  return providerId === 'city'
    ? new MeteredDemoPricing()
    : new FlatFarePricing({
        fareMinor: 1990,
        payoutMinor: 1990,
        currency: 'NZD',
        pricingVersion: 'openride-demo-v1',
      });
}
