import { z } from 'zod';

export const PROTOCOL_VERSION = '0.1.0-draft';
export const ID_SCHEMA = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const OFFER_SCHEMA = z.object({
  id: ID_SCHEMA,
  providerId: ID_SCHEMA,
  providerName: z.string().min(1),
  version: z.number().int().positive(),
  pickup: z.string().min(1),
  destination: z.string().min(1),
  payoutMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  pickupMinutes: z.number().int().nonnegative(),
  tripMinutes: z.number().int().positive(),
  distanceKm: z.number().positive(),
  expiresAt: z.iso.datetime(),
});
export type Offer = z.infer<typeof OFFER_SCHEMA>;
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
