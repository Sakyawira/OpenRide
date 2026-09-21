import { PGlite } from '@electric-sql/pglite';
import { ProtocolError, type Offer } from '@sakyawira/openride-protocol';
import type { ReservationRecord } from './domain';
import type { ProviderRepository } from './ports';

export class PgliteProviderStore implements ProviderRepository {
  private constructor(private readonly db: PGlite) {}

  static async open(path?: string): Promise<PgliteProviderStore> {
    const db = await PGlite.create(path);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, record JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, driver_id TEXT NOT NULL, state TEXT NOT NULL, record JSONB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_assignment_per_offer ON reservations(offer_id)
        WHERE state <> 'cancelled';
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_driver ON reservations(driver_id)
        WHERE state IN ('prepared','confirmed','in_progress');
    `);
    return new PgliteProviderStore(db);
  }

  async availableOffers(now: Date): Promise<Offer[]> {
    const result = await this.db.query<{ record: Offer }>(
      `SELECT o.record FROM offers o WHERE (o.record->>'expiresAt')::timestamptz > $1
       AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.offer_id=o.id AND r.state <> 'cancelled')
       ORDER BY o.record->>'expiresAt' DESC LIMIT 20`,
      [now.toISOString()]
    );
    return result.rows.map((row) => row.record);
  }

  async getOffer(id: string): Promise<Offer | undefined> {
    const result = await this.db.query<{ record: Offer }>('SELECT record FROM offers WHERE id=$1', [
      id,
    ]);
    return result.rows[0]?.record;
  }

  async getReservation(id: string): Promise<ReservationRecord | undefined> {
    const result = await this.db.query<{ record: ReservationRecord }>(
      'SELECT record FROM reservations WHERE id=$1',
      [id]
    );
    return result.rows[0]?.record;
  }

  async claimReservation(record: ReservationRecord): Promise<ReservationRecord> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO reservations (id,offer_id,driver_id,state,record) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING RETURNING id`,
        [record.bookingId, record.offerId, record.driverId, record.state, JSON.stringify(record)]
      );
      if (inserted.rows.length) return record;
      const existing = await tx.query<{ record: ReservationRecord }>(
        'SELECT record FROM reservations WHERE id=$1',
        [record.bookingId]
      );
      if (existing.rows[0]) return existing.rows[0].record;
      throw new ProtocolError(
        'OFFER_UNAVAILABLE',
        'Offer or driver is already reserved at this provider.'
      );
    });
  }

  async changeReservation(
    id: string,
    change: (record: ReservationRecord) => ReservationRecord
  ): Promise<ReservationRecord> {
    return this.db.transaction(async (tx) => {
      const result = await tx.query<{ record: ReservationRecord }>(
        'SELECT record FROM reservations WHERE id=$1 FOR UPDATE',
        [id]
      );
      const previous = result.rows[0]?.record;
      if (!previous)
        throw new ProtocolError('RESERVATION_NOT_FOUND', 'Reservation not found.', 404);
      const next = change(previous);
      if (next === previous) return previous;
      await tx.query('UPDATE reservations SET state=$2, record=$3 WHERE id=$1', [
        id,
        next.state,
        JSON.stringify(next),
      ]);
      return next;
    });
  }

  async addOffers(offers: Offer[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const offer of offers) {
        await tx.query('INSERT INTO offers (id,record) VALUES ($1,$2)', [
          offer.id,
          JSON.stringify(offer),
        ]);
      }
    });
  }

  async hasOffers(): Promise<boolean> {
    const result = await this.db.query('SELECT id FROM offers LIMIT 1');
    return result.rows.length > 0;
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
