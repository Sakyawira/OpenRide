import type { Collection } from 'mongodb';
import { ProtocolError, type Offer } from '@sakyawira/openride-protocol';
import type { ReservationRecord, RideRequestRecord } from './domain';
import { MongoDatabase, isDuplicateKey } from './mongo-database';
import type { ProviderRepository } from './ports';

interface OfferDocument {
  _id: string;
  expiresAt: Date;
  record: Offer;
}
interface RideDocument {
  _id: string;
  riderId: string;
  requestKey: string;
  createdAt: string;
  record: RideRequestRecord;
}
interface ReservationDocument {
  _id: string;
  offerId: string;
  driverId: string;
  claimedOffer: boolean;
  activeDriver: boolean;
  record: ReservationRecord;
}

function document(record: ReservationRecord): ReservationDocument {
  return {
    _id: record.bookingId,
    offerId: record.offerId,
    driverId: record.driverId,
    claimedOffer: record.state !== 'cancelled',
    activeDriver: ['prepared', 'confirmed', 'in_progress'].includes(record.state),
    record,
  };
}

export class MongoProviderStore implements ProviderRepository {
  private readonly offers: Collection<OfferDocument>;
  private readonly reservations: Collection<ReservationDocument>;
  private readonly requests: Collection<RideDocument>;

  private constructor(
    private readonly mongo: MongoDatabase,
    providerId: string
  ) {
    this.offers = mongo.db.collection(`provider_${providerId}_offers`);
    this.reservations = mongo.db.collection(`provider_${providerId}_reservations`);
    this.requests = mongo.db.collection(`provider_${providerId}_ride_requests`);
  }

  static async open(
    uri: string,
    database: string,
    providerId: string
  ): Promise<MongoProviderStore> {
    if (!/^[a-z0-9_-]+$/.test(providerId)) throw new Error('Invalid provider storage namespace.');
    const mongo = await MongoDatabase.open(uri, database);
    const store = new MongoProviderStore(mongo, providerId);
    try {
      await store.offers.createIndex({ expiresAt: -1 });
      await store.requests.createIndex({ riderId: 1, requestKey: 1 }, { unique: true });
      await store.requests.createIndex({ riderId: 1, createdAt: -1 });
      await store.reservations.createIndex(
        { offerId: 1 },
        {
          unique: true,
          partialFilterExpression: { claimedOffer: true },
        }
      );
      await store.reservations.createIndex(
        { driverId: 1 },
        {
          unique: true,
          partialFilterExpression: { activeDriver: true },
        }
      );
      return store;
    } catch (error) {
      await mongo.close();
      throw error;
    }
  }

  async availableOffers(now: Date): Promise<Offer[]> {
    // Discovery is advisory. The unique reservation indexes arbitrate acceptance.
    const claimed = await this.reservations.distinct('offerId', { claimedOffer: true });
    const rows = await this.offers
      .find({ expiresAt: { $gt: now }, _id: { $nin: claimed } })
      .sort({ expiresAt: -1 })
      .limit(20)
      .toArray();
    return rows.map((row) => row.record);
  }

  async getOffer(id: string): Promise<Offer | undefined> {
    return (await this.offers.findOne({ _id: id }))?.record;
  }

  async rideByKey(riderId: string, requestKey: string): Promise<RideRequestRecord | undefined> {
    return (await this.requests.findOne({ riderId, requestKey }))?.record;
  }

  async createRide(record: RideRequestRecord): Promise<RideRequestRecord> {
    try {
      return await this.mongo.transaction(async (session) => {
        await this.requests.insertOne(
          {
            _id: record.id,
            riderId: record.riderId,
            requestKey: record.requestKey,
            createdAt: record.createdAt,
            record,
          },
          { session }
        );
        await this.offers.insertOne(
          {
            _id: record.offer.id,
            expiresAt: new Date(record.offer.expiresAt),
            record: record.offer,
          },
          { session }
        );
        return record;
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const existing = await this.rideByKey(record.riderId, record.requestKey);
      if (!existing) throw error;
      return existing;
    }
  }

  async getRide(riderId: string, id: string): Promise<RideRequestRecord | undefined> {
    return (await this.requests.findOne({ riderId, _id: id }))?.record;
  }

  async listRides(riderId: string): Promise<RideRequestRecord[]> {
    return (await this.requests.find({ riderId }).sort({ createdAt: -1 }).limit(20).toArray()).map(
      (row) => row.record
    );
  }

  async reservationForOffer(offerId: string): Promise<ReservationRecord | undefined> {
    return (await this.reservations.findOne({ offerId, claimedOffer: true }))?.record;
  }

  async getReservation(id: string): Promise<ReservationRecord | undefined> {
    return (await this.reservations.findOne({ _id: id }))?.record;
  }

  async claimReservation(record: ReservationRecord): Promise<ReservationRecord> {
    try {
      // The complete provider claim is one document: this insert is atomic and its
      // partial unique indexes also protect the order and driver across processes.
      await this.reservations.insertOne(document(record));
      return record;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const existing = await this.getReservation(record.bookingId);
      if (existing) return existing;
      throw new ProtocolError(
        'OFFER_UNAVAILABLE',
        'Offer or driver is already reserved at this provider.'
      );
    }
  }

  async changeReservation(
    id: string,
    change: (record: ReservationRecord) => ReservationRecord
  ): Promise<ReservationRecord> {
    return this.mongo.transaction(async (session) => {
      const found = await this.reservations.findOne({ _id: id }, { session });
      if (!found) throw new ProtocolError('RESERVATION_NOT_FOUND', 'Reservation not found.', 404);
      const next = change(found.record);
      if (next === found.record) return next;
      await this.reservations.replaceOne({ _id: id }, document(next), { session });
      return next;
    });
  }

  async addOffers(offers: Offer[]): Promise<void> {
    if (!offers.length) return;
    await this.mongo.transaction(async (session) => {
      await this.offers.insertMany(
        offers.map((record) => ({
          _id: record.id,
          expiresAt: new Date(record.expiresAt),
          record,
        })),
        { session }
      );
    });
  }

  async hasOffers(): Promise<boolean> {
    return (await this.offers.findOne()) !== null;
  }
  async close(): Promise<void> {
    await this.mongo.close();
  }
}
