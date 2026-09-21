import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { MongoClient } from 'mongodb';
import { ProtocolError, type Offer } from '@sakyawira/openride-protocol';
import { DemoProvider } from '@/provider';
import { BookingStore } from '@/store';
import { createStorageHarness, STORAGE_CASES } from './storage-harness';

function offer(): Offer {
  return {
    id: randomUUID(),
    providerId: 'harbour',
    providerName: 'Harbour Cooperative',
    version: 1,
    pickup: 'Britomart',
    destination: 'Newmarket',
    payoutMinor: 2000,
    currency: 'NZD',
    pickupMinutes: 3,
    tripMinutes: 12,
    distanceKm: 5,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

for (const storageCase of STORAGE_CASES.filter((entry) => entry.coordinator === entry.provider)) {
  describe(`${storageCase.coordinator} repository contract`, () => {
    test('concurrent independent claims cannot double book; failed claims emit no events', async (t) => {
      const harness = await createStorageHarness(t, storageCase);
      const first = await harness.openStore();
      const second = storageCase.coordinator === 'mongodb' ? await harness.openStore() : first;
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          (i % 2 ? first : second).claim('driver', randomUUID(), offer())
        )
      );
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      for (const result of results) {
        if (result.status === 'rejected')
          assert.ok(result.reason instanceof ProtocolError && result.reason.code === 'DRIVER_BUSY');
      }
      assert.equal((await first.events('driver')).length, 1);
    });

    test('concurrent pure mutations serialize versions and commit one event per change', async (t) => {
      const harness = await createStorageHarness(t, storageCase);
      const store = await harness.openStore();
      const other = storageCase.coordinator === 'mongodb' ? await harness.openStore() : store;
      const booking = await store.claim('driver', 'request', offer());
      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          (i % 2 ? store : other).change(booking.id, (previous) => ({
            ...previous,
            lastError: String(previous.version),
          }))
        )
      );
      assert.equal((await store.get(booking.id)).version, 13);
      const events = await store.events('driver');
      assert.deepEqual(
        events.map((event) => event.bookingVersion),
        Array.from({ length: 13 }, (_, i) => i + 1)
      );
      assert.equal(new Set(events.map((event) => event.sequence)).size, 13);
      assert.deepEqual(await store.events('stranger'), []);
    });

    test('an event persistence failure rolls back the booking write and preserves its claim', async (t) => {
      const harness = await createStorageHarness(t, storageCase);
      const store = await harness.openStore();
      const record = await store.claim('driver', 'request', offer());
      const before = await store.events('driver');
      // Deliberately fail the event write *after* the adapter has written the booking.
      // This checks the actual database transaction, not a mocked repository method.
      if (store instanceof BookingStore) {
        await store.db.exec(
          "ALTER TABLE events ADD CONSTRAINT reject_test_event CHECK (record->>'type' <> 'booking.confirmed')"
        );
      } else {
        const config = harness.coordinatorConfig;
        assert.equal(config.adapter, 'mongodb');
        if (config.adapter !== 'mongodb') throw new Error('Expected MongoDB configuration.');
        const client = new MongoClient(config.uri);
        try {
          await client.db(config.database).command({
            collMod: 'events',
            validator: { 'record.type': { $ne: 'booking.confirmed' } },
          });
        } finally {
          await client.close();
        }
      }
      await assert.rejects(
        store.change(record.id, (previous) => ({
          ...previous,
          state: 'confirmed',
          pendingAction: null,
        }))
      );
      assert.deepEqual(await store.get(record.id), record);
      assert.equal((await store.active('driver'))?.id, record.id);
      assert.deepEqual(await store.events('driver'), before);
    });

    test('event cursors replay every committed event across page boundaries', async (t) => {
      const harness = await createStorageHarness(t, storageCase);
      const store = await harness.openStore();
      const record = await store.claim('driver', 'request', offer());
      for (let i = 0; i < 205; i++)
        await store.change(record.id, (previous) => ({ ...previous, lastError: String(i) }));
      const page = await store.events('driver');
      assert.equal(page.length, 200);
      const rest = await store.events('driver', page.at(-1)!.sequence);
      assert.equal(rest.length, 6);
      assert.deepEqual(
        [...page, ...rest].map((event) => event.bookingVersion),
        Array.from({ length: 206 }, (_, i) => i + 1)
      );
    });

    test('independent provider writers preserve idempotency, identity and order ownership', async (t) => {
      const harness = await createStorageHarness(t, storageCase);
      const store = await harness.openProviderStore('harbour');
      const other =
        storageCase.provider === 'mongodb' ? await harness.openProviderStore('harbour') : store;
      const first = new DemoProvider('harbour', 'Harbour Cooperative', store);
      const second = new DemoProvider('harbour', 'Harbour Cooperative', other);
      const order = offer();
      await store.addOffers([order]);
      const command = {
        bookingId: randomUUID(),
        token: randomUUID(),
        driverId: 'driver',
        offerId: order.id,
        offerVersion: order.version,
      };
      const retries = await Promise.all([first.prepare(command), second.prepare(command)]);
      assert.deepEqual(retries[0], retries[1]);
      await assert.rejects(
        second.prepare({ ...command, token: randomUUID() }),
        (error: unknown) => error instanceof ProtocolError && error.code === 'RESERVATION_MISMATCH'
      );
      await assert.rejects(
        second.prepare({ ...command, bookingId: randomUUID(), driverId: 'competitor' }),
        (error: unknown) => error instanceof ProtocolError && error.code === 'OFFER_UNAVAILABLE'
      );
      await first.apply(command.bookingId, command.token, 'commit');
      await second.apply(command.bookingId, command.token, 'start');
      await first.apply(command.bookingId, command.token, 'complete');
      await assert.rejects(
        second.apply(command.bookingId, command.token, 'commit'),
        (error: unknown) => error instanceof ProtocolError && error.code === 'INVALID_TRANSITION'
      );
      assert.equal((await second.prepare(command)).state, 'completed');
      assert.deepEqual(await first.offers(), []);
    });
  });
}
