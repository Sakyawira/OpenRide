import type { BookingRepository } from './ports';
import { randomUUID } from 'node:crypto';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { ProtocolError, type Offer, type ProtocolEvent } from '@sakyawira/openride-protocol';
import type { BookingRecord } from './domain';

export class BookingStore implements BookingRepository {
  private constructor(readonly db: PGlite) {}

  static async open(path?: string): Promise<BookingStore> {
    const db = await PGlite.create(path);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY, driver_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        state TEXT NOT NULL, record JSONB NOT NULL,
        UNIQUE(driver_id, idempotency_key)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_driver ON bookings(driver_id)
        WHERE state IN ('preparing','resolving','confirmed','in_progress');
      CREATE TABLE IF NOT EXISTS events (
        sequence SERIAL PRIMARY KEY, driver_id TEXT NOT NULL, record JSONB NOT NULL
      );
    `);
    return new BookingStore(db);
  }

  async get(id: string): Promise<BookingRecord> {
    const result = await this.db.query<{ record: BookingRecord }>(
      'SELECT record FROM bookings WHERE id = $1',
      [id]
    );
    const record = result.rows[0]?.record;
    if (!record) throw new ProtocolError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    return record;
  }

  async byKey(driverId: string, key: string): Promise<BookingRecord | undefined> {
    const result = await this.db.query<{ record: BookingRecord }>(
      'SELECT record FROM bookings WHERE driver_id = $1 AND idempotency_key = $2',
      [driverId, key]
    );
    return result.rows[0]?.record;
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
    // The unique index, not a prior availability check, arbitrates concurrent accepts.
    return this.db.transaction(async (tx) => {
      const insert = await tx.query<{ id: string }>(
        `INSERT INTO bookings (id, driver_id, idempotency_key, state, record)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,
        [record.id, driverId, key, record.state, JSON.stringify(record)]
      );
      if (!insert.rows.length) {
        const existing = await tx.query<{ record: BookingRecord }>(
          'SELECT record FROM bookings WHERE driver_id=$1 AND idempotency_key=$2',
          [driverId, key]
        );
        if (existing.rows[0]) return existing.rows[0].record;
        throw new ProtocolError('DRIVER_BUSY', 'You already have an active or unresolved booking.');
      }
      await this.event(tx, record, 'booking.preparing');
      return record;
    });
  }

  async change(
    id: string,
    change: (record: BookingRecord) => BookingRecord
  ): Promise<BookingRecord> {
    return this.db.transaction(async (tx) => {
      const result = await tx.query<{ record: BookingRecord }>(
        'SELECT record FROM bookings WHERE id=$1 FOR UPDATE',
        [id]
      );
      const previous = result.rows[0]?.record;
      if (!previous) throw new ProtocolError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
      const next = change(previous);
      if (next === previous) return previous;
      next.version = previous.version + 1;
      next.updatedAt = new Date().toISOString();
      await tx.query('UPDATE bookings SET state=$2, record=$3 WHERE id=$1', [
        id,
        next.state,
        JSON.stringify(next),
      ]);
      await this.event(tx, next, `booking.${next.state}`);
      return next;
    });
  }

  async active(driverId: string): Promise<BookingRecord | undefined> {
    const result = await this.db.query<{ record: BookingRecord }>(
      `SELECT record FROM bookings WHERE driver_id=$1 AND state IN ('preparing','resolving','confirmed','in_progress')`,
      [driverId]
    );
    return result.rows[0]?.record;
  }

  async pending(): Promise<BookingRecord[]> {
    const result = await this.db.query<{ record: BookingRecord }>(
      `SELECT record FROM bookings WHERE record->>'pendingAction' IS NOT NULL`
    );
    return result.rows.map((row) => row.record);
  }

  async events(driverId: string, after = 0): Promise<ProtocolEvent[]> {
    const result = await this.db.query<{
      sequence: number;
      record: Omit<ProtocolEvent, 'sequence'>;
    }>(
      'SELECT sequence, record FROM events WHERE driver_id=$1 AND sequence > $2 ORDER BY sequence LIMIT 200',
      [driverId, after]
    );
    return result.rows.map((row) => ({ ...row.record, sequence: row.sequence }));
  }

  private async event(tx: Transaction, record: BookingRecord, type: string): Promise<void> {
    await tx.query('INSERT INTO events (driver_id, record) VALUES ($1,$2)', [
      record.driverId,
      JSON.stringify({
        type,
        bookingId: record.id,
        bookingVersion: record.version,
        occurredAt: record.updatedAt,
      }),
    ]);
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
