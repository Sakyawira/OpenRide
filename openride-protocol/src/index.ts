import { z } from 'zod';

export const PROTOCOL_VERSION = '0.1.0-draft';
export const ID_SCHEMA = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const GEO_POINT_SCHEMA = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
export type GeoPoint = z.infer<typeof GEO_POINT_SCHEMA>;
export const RIDE_LOCATIONS_SCHEMA = z
  .object({
    pickup: GEO_POINT_SCHEMA,
    destination: GEO_POINT_SCHEMA,
  })
  .strict();
export type RideLocations = z.infer<typeof RIDE_LOCATIONS_SCHEMA>;
export const OFFER_SCHEMA = z.object({
  id: ID_SCHEMA,
  providerId: ID_SCHEMA,
  providerName: z.string().min(1),
  version: z.number().int().positive(),
  pickup: z.string().min(1),
  destination: z.string().min(1),
  locations: RIDE_LOCATIONS_SCHEMA.optional(),
  payoutMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  pickupMinutes: z.number().int().nonnegative(),
  tripMinutes: z.number().int().positive(),
  distanceKm: z.number().positive(),
  expiresAt: z.iso.datetime(),
});
export type Offer = z.infer<typeof OFFER_SCHEMA>;
export const RIDE_INPUT_SCHEMA = z
  .object({
    pickup: z.string().trim().min(3).max(160),
    destination: z.string().trim().min(3).max(160),
    locations: RIDE_LOCATIONS_SCHEMA.optional(),
  })
  .strict();
export type RideInput = z.infer<typeof RIDE_INPUT_SCHEMA>;
export const PRICE_TERMS_SCHEMA = z
  .object({
    fareMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    payoutMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/),
    pricingVersion: ID_SCHEMA,
  })
  .strict();
export type PriceTerms = z.infer<typeof PRICE_TERMS_SCHEMA>;
export const QUOTE_INPUT_SCHEMA = RIDE_INPUT_SCHEMA.extend({ providerId: ID_SCHEMA });
export type QuoteInput = z.infer<typeof QUOTE_INPUT_SCHEMA>;
export const RIDE_QUOTE_SCHEMA = QUOTE_INPUT_SCHEMA.extend({ price: PRICE_TERMS_SCHEMA });
export type RideQuote = z.infer<typeof RIDE_QUOTE_SCHEMA>;
export const CREATE_RIDE_SCHEMA = QUOTE_INPUT_SCHEMA.extend({
  expectedPrice: PRICE_TERMS_SCHEMA.optional(),
});
export type CreateRideRequest = z.infer<typeof CREATE_RIDE_SCHEMA>;
export const PROVIDER_RIDE_INPUT_SCHEMA = RIDE_INPUT_SCHEMA.extend({
  riderId: ID_SCHEMA,
  requestKey: ID_SCHEMA,
  expectedPrice: PRICE_TERMS_SCHEMA.optional(),
});
export type ProviderRideInput = z.infer<typeof PROVIDER_RIDE_INPUT_SCHEMA>;
export const RIDE_REQUEST_SCHEMA = z.object({
  id: z.uuid(),
  providerId: ID_SCHEMA,
  providerName: z.string(),
  pickup: z.string(),
  destination: z.string(),
  locations: RIDE_LOCATIONS_SCHEMA.optional(),
  fareMinor: z.number().int().nonnegative(),
  currency: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  status: z.enum(['searching', 'matching', 'confirmed', 'in_progress', 'completed', 'expired']),
  bookingId: z.uuid().nullable(),
});
export type RideRequest = z.infer<typeof RIDE_REQUEST_SCHEMA>;
export interface RiderSnapshot {
  requests: RideRequest[];
  providers: { id: string; name: string; available: boolean }[];
}
export const ACCEPT_SCHEMA = z
  .object({ providerId: ID_SCHEMA, offerId: ID_SCHEMA, offerVersion: z.number().int().positive() })
  .strict();
export type AcceptRequest = z.infer<typeof ACCEPT_SCHEMA>;
export const PREPARE_SCHEMA = z
  .object({
    bookingId: z.uuid(),
    driverId: ID_SCHEMA,
    offerId: ID_SCHEMA,
    offerVersion: z.number().int().positive(),
    token: z.string().min(32).max(100),
  })
  .strict();
export type PrepareRequest = z.infer<typeof PREPARE_SCHEMA>;
export const PROVIDER_STATE_SCHEMA = z.enum([
  'prepared',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
]);
export const PROVIDER_RESERVATION_SCHEMA = z.object({
  bookingId: z.uuid(),
  state: PROVIDER_STATE_SCHEMA,
});
export type ProviderReservation = z.infer<typeof PROVIDER_RESERVATION_SCHEMA>;
export const PROVIDER_ACTION_SCHEMA = z.enum(['commit', 'start', 'complete', 'cancel']);
export type ProviderAction = z.infer<typeof PROVIDER_ACTION_SCHEMA>;
export const TRIP_ACTION_SCHEMA = z.enum(['start', 'complete', 'cancel']);
export type TripAction = z.infer<typeof TRIP_ACTION_SCHEMA>;
export type BookingState =
  'preparing' | 'resolving' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'rejected';
export interface Booking {
  id: string;
  driverId: string;
  providerId: string;
  offer: Offer;
  state: BookingState;
  version: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
export const BOOKING_SCHEMA = z.object({
  id: z.uuid(),
  driverId: ID_SCHEMA,
  providerId: ID_SCHEMA,
  offer: OFFER_SCHEMA,
  state: z.enum([
    'preparing',
    'resolving',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'rejected',
  ]),
  version: z.number().int().positive(),
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const PROVIDER_FEED_SCHEMA = z.object({
  id: ID_SCHEMA,
  name: z.string(),
  available: z.boolean(),
});
export const DRIVER_SNAPSHOT_SCHEMA = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  driverId: ID_SCHEMA,
  activeBooking: BOOKING_SCHEMA.nullable(),
  offers: OFFER_SCHEMA.array(),
  providers: PROVIDER_FEED_SCHEMA.array(),
});
export type DriverSnapshot = z.infer<typeof DRIVER_SNAPSHOT_SCHEMA>;
export const RIDER_SNAPSHOT_SCHEMA = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requests: RIDE_REQUEST_SCHEMA.array(),
  providers: PROVIDER_FEED_SCHEMA.array(),
});
export interface ProtocolEvent {
  sequence: number;
  type: string;
  bookingId: string;
  bookingVersion: number;
  occurredAt: string;
}
export class ProtocolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409
  ) {
    super(message);
  }
}
