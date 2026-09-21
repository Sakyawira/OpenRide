import type {
  Booking,
  PrepareRequest,
  ProviderAction,
  ProviderReservation,
} from '@sakyawira/openride-protocol';

export interface BookingRecord extends Booking {
  idempotencyKey: string;
  token: string;
  pendingAction: 'prepare' | ProviderAction | null;
}

export interface ReservationRecord extends PrepareRequest, ProviderReservation {}

export function publicBooking(record: BookingRecord): Booking {
  return {
    id: record.id,
    driverId: record.driverId,
    providerId: record.providerId,
    offer: record.offer,
    state: record.state,
    version: record.version,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
