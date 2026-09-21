import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  ProtocolError,
  type Offer,
  type PrepareRequest,
  type ProviderAction,
  type ProviderReservation,
} from '@sakyawira/openride-protocol';
import type { ProviderAdapter } from './ports';

interface ReservationRecord extends ProviderReservation {
  driverId: string;
  offerId: string;
  offerVersion: number;
  token: string;
}

export class DemoProvider implements ProviderAdapter {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly db: PGlite
  ) {}

  static async open(id: string, name: string, path?: string): Promise<DemoProvider> {
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
    return new DemoProvider(id, name, db);
  }

  async offers(): Promise<Offer[]> {
    const result = await this.db.query<{ record: Offer }>(
      `SELECT o.record FROM offers o WHERE (o.record->>'expiresAt')::timestamptz > now()
       AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.offer_id=o.id AND r.state <> 'cancelled')
       ORDER BY o.record->>'expiresAt' DESC LIMIT 20`
    );
    return result.rows.map((row) => row.record);
  }

  async getOffer(id: string): Promise<Offer> {
    const result = await this.db.query<{ record: Offer }>('SELECT record FROM offers WHERE id=$1', [
      id,
    ]);
    const offer = result.rows[0]?.record;
    if (!offer)
      throw new ProtocolError('OFFER_UNAVAILABLE', 'This offer is no longer available.', 404);
    return offer;
  }

  async prepare(request: PrepareRequest): Promise<ProviderReservation> {
    return this.db.transaction(async (tx) => {
      const previous = await tx.query<{ record: ReservationRecord }>(
        'SELECT record FROM reservations WHERE id=$1',
        [request.bookingId]
      );
      const existing = previous.rows[0]?.record;
      if (existing) {
        if (
          existing.token !== request.token ||
          existing.driverId !== request.driverId ||
          existing.offerId !== request.offerId ||
          existing.offerVersion !== request.offerVersion
        ) {
          throw new ProtocolError('RESERVATION_MISMATCH', 'Reservation identity does not match.');
        }
        return { bookingId: existing.bookingId, state: existing.state };
      }
      const result = await tx.query<{ record: Offer }>('SELECT record FROM offers WHERE id=$1', [
        request.offerId,
      ]);
      const offer = result.rows[0]?.record;
      if (!offer)
        throw new ProtocolError('OFFER_UNAVAILABLE', 'This offer is no longer available.');
      if (offer.version !== request.offerVersion)
        throw new ProtocolError(
          'OFFER_VERSION_MISMATCH',
          'Offer terms have changed. Refresh offers.'
        );
      if (Date.parse(offer.expiresAt) <= Date.now())
        throw new ProtocolError('OFFER_EXPIRED', 'This offer has expired.');
      const record: ReservationRecord = { ...request, state: 'prepared' };
      const insert = await tx.query<{ id: string }>(
        `INSERT INTO reservations (id,offer_id,driver_id,state,record) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING RETURNING id`,
        [record.bookingId, record.offerId, record.driverId, record.state, JSON.stringify(record)]
      );
      if (!insert.rows.length)
        throw new ProtocolError(
          'OFFER_UNAVAILABLE',
          'Offer or driver is already reserved at this provider.'
        );
      return { bookingId: record.bookingId, state: record.state };
    });
  }

  async apply(id: string, token: string, action: ProviderAction): Promise<ProviderReservation> {
    return this.db.transaction(async (tx) => {
      const result = await tx.query<{ record: ReservationRecord }>(
        'SELECT record FROM reservations WHERE id=$1 FOR UPDATE',
        [id]
      );
      const record = result.rows[0]?.record;
      if (!record || record.token !== token)
        throw new ProtocolError('RESERVATION_NOT_FOUND', 'Reservation not found.', 404);
      const target = {
        commit: 'confirmed',
        start: 'in_progress',
        complete: 'completed',
        cancel: 'cancelled',
      } as const;
      const source = {
        commit: 'prepared',
        start: 'confirmed',
        complete: 'in_progress',
        cancel: 'confirmed',
      } as const;
      if (record.state === target[action]) return { bookingId: id, state: record.state };
      if (record.state !== source[action])
        throw new ProtocolError(
          'INVALID_TRANSITION',
          `Cannot ${action} a ${record.state} reservation.`
        );
      const next = { ...record, state: target[action] };
      await tx.query('UPDATE reservations SET state=$2, record=$3 WHERE id=$1', [
        id,
        next.state,
        JSON.stringify(next),
      ]);
      return { bookingId: id, state: next.state };
    });
  }

  async seed(): Promise<void> {
    const routes =
      this.id === 'harbour'
        ? ([
            ['Britomart', 'Ponsonby Central', 1860, 4, 14, 4.2],
            ['Wynyard Quarter', 'Mount Eden Village', 2450, 6, 19, 6.8],
          ] as const)
        : ([
            ['Commercial Bay', 'Newmarket', 2140, 3, 16, 5.1],
            ['Parnell Village', 'Mission Bay', 2870, 7, 22, 8.4],
          ] as const);
    await this.db.transaction(async (tx) => {
      for (const [
        pickup,
        destination,
        payoutMinor,
        pickupMinutes,
        tripMinutes,
        distanceKm,
      ] of routes) {
        const offer: Offer = {
          id: randomUUID(),
          providerId: this.id,
          providerName: this.name,
          version: 1,
          pickup,
          destination,
          payoutMinor,
          currency: 'NZD',
          pickupMinutes,
          tripMinutes,
          distanceKm,
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        };
        await tx.query('INSERT INTO offers (id,record) VALUES ($1,$2)', [
          offer.id,
          JSON.stringify(offer),
        ]);
      }
    });
  }

  async seedIfEmpty(): Promise<void> {
    const result = await this.db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM offers'
    );
    if (result.rows[0]?.count === 0) await this.seed();
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
