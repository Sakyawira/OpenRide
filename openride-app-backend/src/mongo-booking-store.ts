import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection } from 'mongodb';
import { ProtocolError, type Offer, type ProtocolEvent } from '@sakyawira/openride-protocol';
import type { BookingRecord } from './domain';
import { MongoDatabase, isDuplicateKey } from './mongo-database';
import type { BookingRepository } from './ports';

interface BookingDocument {
  _id: string;
  driverId: string;
  key: string;
  active: boolean;
  record: BookingRecord;
}
interface EventDocument {
  _id: number;
  driverId: string;
  record: ProtocolEvent;
}
interface CounterDocument {
  _id: string;
  value: number;
}

function document(record: BookingRecord): BookingDocument {
  return {
    _id: record.id,
    driverId: record.driverId,
    key: record.idempotencyKey,
    active: ['preparing', 'resolving', 'confirmed', 'in_progress'].includes(record.state),
    record,
  };
}

export class MongoBookingStore implements BookingRepository {
  private readonly bookings: Collection<BookingDocument>;
  private readonly log: Collection<EventDocument>;
  private readonly counters: Collection<CounterDocument>;

  private constructor(private readonly mongo: MongoDatabase) {
    this.bookings = mongo.db.collection('bookings');
    this.log = mongo.db.collection('events');
    this.counters = mongo.db.collection('counters');
  }

  static async open(uri: string, database: string): Promise<MongoBookingStore> {
    const mongo = await MongoDatabase.open(uri, database);
    const store = new MongoBookingStore(mongo);
    try {
      await store.bookings.createIndex({ driverId: 1, key: 1 }, { unique: true });
      await store.bookings.createIndex(
        { driverId: 1 },
        {
          name: 'one_active_booking_per_driver',
          unique: true,
          partialFilterExpression: { active: true },
        }
      );
      await store.log.createIndex({ driverId: 1, _id: 1 });
      try {
        await store.counters.updateOne(
          { _id: 'events' },
          { $setOnInsert: { value: 0 } },
          { upsert: true }
        );
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
      return store;
    } catch (error) {
      await mongo.close();
      throw error;
    }
  }

  async get(id: string): Promise<BookingRecord> {
    const found = await this.bookings.findOne({ _id: id });
    if (!found) throw new ProtocolError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    return found.record;
  }

  async byKey(driverId: string, key: string): Promise<BookingRecord | undefined> {
    return (await this.bookings.findOne({ driverId, key }))?.record;
  }

  async claim(driverId: string, key: string, offer: Offer): Promise<BookingRecord> {
    const now = new Date().toISOString();
    const record: BookingRecord = {
      id: randomUUID(),
      driverId,
      idempotencyKey: key,
      providerId: offer.providerId,
      offer,
      state: 'preparing',
      pendingAction: 'prepare',
      token: randomUUID(),
      version: 1,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      return await this.mongo.transaction(async (session) => {
        await this.bookings.insertOne(document(record), { session });
        await this.event(record, session);
        return record;
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const existing = await this.byKey(driverId, key);
      if (existing) return existing;
      throw new ProtocolError('DRIVER_BUSY', 'You already have an active or unresolved booking.');
    }
  }

  async change(
    id: string,
    change: (record: BookingRecord) => BookingRecord
  ): Promise<BookingRecord> {
    return this.mongo.transaction(async (session) => {
      const found = await this.bookings.findOne({ _id: id }, { session });
      if (!found) throw new ProtocolError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
      const previous = found.record;
      const changed = change(previous);
      if (changed === previous) return previous;
      const next = {
        ...changed,
        version: previous.version + 1,
        updatedAt: new Date().toISOString(),
      };
      // Concurrent replacements cause a transaction write conflict. The driver reruns
      // the pure callback against the committed record instead of overwriting it.
      await this.bookings.replaceOne({ _id: id }, document(next), { session });
      await this.event(next, session);
      return next;
    });
  }

  async active(driverId: string): Promise<BookingRecord | undefined> {
    return (await this.bookings.findOne({ driverId, active: true }))?.record;
  }

  async pending(): Promise<BookingRecord[]> {
    return (await this.bookings.find({ 'record.pendingAction': { $ne: null } }).toArray()).map(
      (row) => row.record
    );
  }

  async events(driverId: string, after = 0): Promise<ProtocolEvent[]> {
    return (
      await this.log
        .find({ driverId, _id: { $gt: after } })
        .sort({ _id: 1 })
        .limit(200)
        .toArray()
    ).map((row) => row.record);
  }

  private async event(record: BookingRecord, session: ClientSession): Promise<void> {
    // Allocate the cursor in the same transaction as the event and booking. A reader
    // must never pass a cursor whose lower-numbered event is still uncommitted.
    const counter = await this.counters.findOneAndUpdate(
      { _id: 'events' },
      { $inc: { value: 1 } },
      { session, returnDocument: 'after' }
    );
    if (!counter) throw new Error('Event counter is not initialized.');
    await this.log.insertOne(
      {
        _id: counter.value,
        driverId: record.driverId,
        record: {
          sequence: counter.value,
          type: `booking.${record.state}`,
          bookingId: record.id,
          bookingVersion: record.version,
          occurredAt: record.updatedAt,
        },
      },
      { session }
    );
  }

  async close(): Promise<void> {
    await this.mongo.close();
  }
}
