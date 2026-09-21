import type {
  Offer,
  PrepareRequest,
  ProviderAction,
  ProviderReservation,
  ProtocolEvent,
} from '@sakyawira/openride-protocol';
import type { BookingRecord, ReservationRecord } from './domain';

export interface ProviderAdapter {
  id: string;
  name: string;
  offers(): Promise<Offer[]>;
  getOffer(id: string): Promise<Offer>;
  prepare(request: PrepareRequest): Promise<ProviderReservation>;
  apply(id: string, token: string, action: ProviderAction): Promise<ProviderReservation>;
}

/** Reference-demo capability, deliberately outside the interoperable transport. */
export interface DemoOfferSeeder {
  seed(): Promise<void>;
}

/** Atomic persistence boundary. Event emission and booking mutation MUST be one commit.
 * Implementations must durably arbitrate one active claim per driver across all writers.
 * change() must serialize conflicting updates; its callback must be side-effect free.
 * An eventually consistent last-writer-wins implementation is NOT conforming.
 */
export interface BookingRepository {
  get(id: string): Promise<BookingRecord>;
  byKey(driverId: string, key: string): Promise<BookingRecord | undefined>;
  claim(driverId: string, key: string, offer: Offer): Promise<BookingRecord>;
  change(id: string, change: (record: BookingRecord) => BookingRecord): Promise<BookingRecord>;
  active(driverId: string): Promise<BookingRecord | undefined>;
  pending(): Promise<BookingRecord[]>;
  events(driverId: string, after?: number): Promise<ProtocolEvent[]>;
  close(): Promise<void>;
}

/** Independent provider persistence. Claims must be atomic across all writers.
 * One non-cancelled assignment per offer, and one active reservation per driver.
 * Existing booking IDs return the original record, even after completion/cancellation.
 * Mutation callbacks are pure and may be retried by a transactional adapter.
 */
export interface ProviderRepository {
  availableOffers(now: Date): Promise<Offer[]>;
  getOffer(id: string): Promise<Offer | undefined>;
  getReservation(id: string): Promise<ReservationRecord | undefined>;
  claimReservation(record: ReservationRecord): Promise<ReservationRecord>;
  changeReservation(
    id: string,
    change: (record: ReservationRecord) => ReservationRecord
  ): Promise<ReservationRecord>;
  addOffers(offers: Offer[]): Promise<void>;
  hasOffers(): Promise<boolean>;
  close(): Promise<void>;
}

/** A process-local scheduler only; durable pending commands belong to the repository. */
export interface RecoveryScheduler {
  start(work: () => Promise<void>): void;
  stop(): Promise<void>;
}

/** Bind an incoming bearer credential to identity; never trust a driver ID in the body. */
export interface DriverAuthenticator {
  authenticate(authorization: string | undefined): Promise<string>;
}
