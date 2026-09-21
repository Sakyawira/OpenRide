import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test, type TestContext } from 'node:test';
import { createStorageHarness, STORAGE_CASES } from './storage-harness';
import { StaticBearerAuthenticator } from '@/authentication';
import { Coordinator } from '@/coordinator';
import { DemoProvider } from '@/provider';
import { coordinatorServer, providerServer } from '@/server';
import { HttpProvider } from '@/http-provider';
import {
  ProtocolError,
  type AcceptRequest,
  type Offer,
  type PrepareRequest,
  type ProviderAction,
  type ProviderReservation,
} from '@sakyawira/openride-protocol';
import { DRIVER_ID } from '@/fixtures';
import type { ProviderAdapter } from '@/ports';

function request(offer: Offer): AcceptRequest {
  return { providerId: offer.providerId, offerId: offer.id, offerVersion: offer.version };
}

for (const storageCase of STORAGE_CASES) {
  describe(storageCase.name, () => {
    test('injected identity controls booking ownership and event visibility', async (t) => {
      const { coordinator, a } = await fixture(t);
      const app = await coordinatorServer(coordinator, {
        async authenticate(header) {
          if (header === 'Bearer alice') return 'alice';
          if (header === 'Bearer bob') return 'bob';
          throw new ProtocolError('UNAUTHORIZED', 'Unknown driver.', 401);
        },
      });
      t.after(async () => app.close());
      const accepted = await app.inject({
        method: 'POST',
        url: '/v0.1/bookings',
        headers: { authorization: 'Bearer alice', 'idempotency-key': randomUUID() },
        payload: request(a),
      });
      assert.equal(accepted.statusCode, 200);
      const record = accepted.json<{ id: string; driverId: string }>();
      assert.equal(record.driverId, 'alice');
      assert.equal(
        (
          await app.inject({
            url: `/v0.1/bookings/${record.id}`,
            headers: { authorization: 'Bearer bob' },
          })
        ).statusCode,
        404
      );
      const events = await app.inject({
        url: '/v0.1/events',
        headers: { authorization: 'Bearer bob' },
      });
      assert.deepEqual(events.json(), { events: [] });
      const snapshot = await app.inject({
        url: '/v0.1/snapshot',
        headers: { authorization: 'Bearer bob' },
      });
      assert.equal(snapshot.json<{ activeBooking: unknown }>().activeBooking, null);
    });
    function code(expected: string): (error: unknown) => boolean {
      return (error) => error instanceof ProtocolError && error.code === expected;
    }

    class FaultProvider implements ProviderAdapter {
      readonly id: string;
      readonly name: string;
      loseNext: 'prepare' | ProviderAction | null = null;
      offline = false;
      afterPrepare?: () => Promise<void>;
      constructor(private readonly inner: DemoProvider) {
        this.id = inner.id;
        this.name = inner.name;
      }
      async offers(): Promise<Offer[]> {
        if (this.offline) throw new Error('Offline');
        return this.inner.offers();
      }
      async getOffer(id: string): Promise<Offer> {
        return this.inner.getOffer(id);
      }
      async seed(): Promise<void> {
        await this.inner.seed();
      }
      async prepare(value: PrepareRequest): Promise<ProviderReservation> {
        const result = await this.inner.prepare(value);
        await this.afterPrepare?.();
        if (this.loseNext === 'prepare') {
          this.loseNext = null;
          throw new Error('Response lost after durable prepare');
        }
        return result;
      }
      async apply(id: string, token: string, action: ProviderAction): Promise<ProviderReservation> {
        const result = await this.inner.apply(id, token, action);
        if (this.loseNext === action) {
          this.loseNext = null;
          throw new Error('Response lost after durable action');
        }
        return result;
      }
    }

    async function fixture(t: TestContext) {
      const storage = await createStorageHarness(t, storageCase);
      const store = await storage.openStore();
      const harbourStore = await storage.openProviderStore('harbour');
      const harbour = new DemoProvider('harbour', 'Harbour Cooperative', harbourStore);
      const city = new DemoProvider(
        'city',
        'City Cooperative',
        await storage.openProviderStore('city')
      );
      await harbour.seed();
      await city.seed();
      const fault = new FaultProvider(harbour);
      const coordinator = new Coordinator(store, [fault, city]);
      t.after(async () => {
        await coordinator.idle();
      });
      const a = (await harbour.offers())[0];
      const b = (await city.offers())[0];
      assert.ok(a && b);
      return { store, harbour, city, fault, coordinator, a, b, storage, harbourStore };
    }

    test('two simultaneous providers can confirm only one ride for a driver', async (t) => {
      const { coordinator, store, a, b } = await fixture(t);
      const results = await Promise.allSettled([
        coordinator.accept(DRIVER_ID, randomUUID(), request(a)),
        coordinator.accept(DRIVER_ID, randomUUID(), request(b)),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const loser = results.find((result) => result.status === 'rejected');
      assert.ok(loser?.status === 'rejected' && code('DRIVER_BUSY')(loser.reason));
      assert.equal((await store.active(DRIVER_ID))?.state, 'confirmed');
    });

    test('simultaneous retries share one booking; reusing the key for another offer fails', async (t) => {
      const { coordinator, store, a, b } = await fixture(t);
      const key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 8 }, () => coordinator.accept(DRIVER_ID, key, request(a)))
      );
      assert.equal(new Set(results.map((record) => record.id)).size, 1);
      await assert.rejects(
        coordinator.accept(DRIVER_ID, key, request(b)),
        code('IDEMPOTENCY_CONFLICT')
      );
      const events = await store.events(DRIVER_ID);
      assert.deepEqual(
        events.map((event) => event.bookingVersion),
        [1, 2, 3]
      );
      assert.equal(new Set(events.map((event) => event.sequence)).size, 3);
    });

    test('provider arbitrates two drivers competing for the same order', async (t) => {
      const { coordinator, a } = await fixture(t);
      const results = await Promise.all([
        coordinator.accept('driver-one', randomUUID(), request(a)),
        coordinator.accept('driver-two', randomUUID(), request(a)),
      ]);
      assert.deepEqual(results.map((record) => record.state).sort(), ['confirmed', 'rejected']);
    });

    for (const lost of ['prepare', 'commit', 'start', 'complete', 'cancel'] as const) {
      test(`lost ${lost} response keeps the driver claimed until safe reconciliation`, async (t) => {
        const { coordinator, store, fault, a, b } = await fixture(t);
        let record;
        if (lost === 'prepare' || lost === 'commit') {
          fault.loseNext = lost;
          record = await coordinator.accept(DRIVER_ID, randomUUID(), request(a));
        } else {
          record = await coordinator.accept(DRIVER_ID, randomUUID(), request(a));
          if (lost === 'complete') record = await coordinator.action(DRIVER_ID, record.id, 'start');
          fault.loseNext = lost;
          record = await coordinator.action(DRIVER_ID, record.id, lost);
        }
        assert.equal(record.state, 'resolving');
        await assert.rejects(
          coordinator.accept(DRIVER_ID, randomUUID(), request(b)),
          code('DRIVER_BUSY')
        );
        await coordinator.recover();
        const expected = {
          prepare: 'confirmed',
          commit: 'confirmed',
          start: 'in_progress',
          complete: 'completed',
          cancel: 'cancelled',
        } as const;
        assert.equal((await store.get(record.id)).state, expected[lost]);
        assert.equal((await store.get(record.id)).pendingAction, null);
      });
    }

    test('durable state survives coordinator AND provider restart after a lost acknowledgement', async (t) => {
      const { storage, store, harbour, city, fault, coordinator, a } = await fixture(t);
      fault.loseNext = 'commit';
      const key = randomUUID();
      const original = await coordinator.accept(DRIVER_ID, key, request(a));
      assert.equal(original.pendingAction, 'commit');
      const before = await store.events(DRIVER_ID);
      await coordinator.idle();
      await store.close();
      await harbour.close();
      await city.close();
      const reopened = await storage.openStore();
      const provider = new DemoProvider(
        'harbour',
        'Harbour Cooperative',
        await storage.openProviderStore('harbour')
      );
      const restarted = new Coordinator(reopened, [provider]);
      assert.equal((await reopened.active(DRIVER_ID))?.id, original.id);
      assert.deepEqual(await reopened.events(DRIVER_ID), before);
      await restarted.recover();
      assert.equal((await reopened.get(original.id)).state, 'confirmed');
      assert.equal((await reopened.events(DRIVER_ID)).at(-1)?.type, 'booking.confirmed');
      assert.equal((await restarted.accept(DRIVER_ID, key, request(a))).id, original.id);
      assert.ok(!(await provider.offers()).some((offer) => offer.id === a.id));
    });

    test('invalid transitions fail; completion releases driver but never reoffers completed order', async (t) => {
      const { coordinator, harbour, a, b, store } = await fixture(t);
      const record = await coordinator.accept(DRIVER_ID, randomUUID(), request(a));
      await assert.rejects(
        coordinator.action(DRIVER_ID, record.id, 'complete'),
        code('INVALID_TRANSITION')
      );
      await coordinator.action(DRIVER_ID, record.id, 'start');
      await assert.rejects(
        coordinator.action(DRIVER_ID, record.id, 'cancel'),
        code('INVALID_TRANSITION')
      );
      await coordinator.action(DRIVER_ID, record.id, 'complete');
      await coordinator.action(DRIVER_ID, record.id, 'complete');
      assert.equal(await store.active(DRIVER_ID), undefined);
      assert.ok(!(await harbour.offers()).some((offer) => offer.id === a.id));
      assert.equal(
        (await coordinator.accept(DRIVER_ID, randomUUID(), request(b))).state,
        'confirmed'
      );
    });

    test('expired offers and changed prices cannot silently be accepted', async (t) => {
      const { coordinator, harbourStore, a, store } = await fixture(t);
      await assert.rejects(
        coordinator.accept(DRIVER_ID, randomUUID(), { ...request(a), offerVersion: 2 }),
        code('OFFER_VERSION_MISMATCH')
      );
      const expired = {
        ...a,
        id: randomUUID(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      await harbourStore.addOffers([expired]);
      await assert.rejects(
        coordinator.accept(DRIVER_ID, randomUUID(), request(expired)),
        code('OFFER_EXPIRED')
      );
      assert.equal(await store.active(DRIVER_ID), undefined);
    });

    test('offline provider does not hide the active booking or other provider offers', async (t) => {
      const { coordinator, fault, a } = await fixture(t);
      const record = await coordinator.accept(DRIVER_ID, randomUUID(), request(a));
      fault.offline = true;
      const snapshot = await coordinator.snapshot(DRIVER_ID);
      assert.equal(snapshot.activeBooking?.id, record.id);
      assert.equal(snapshot.providers[0]?.available, false);
      assert.equal(snapshot.offers.length, 2);
    });

    test('HTTP validates identity, keys and request fields; secrets never reach drivers', async (t) => {
      const { coordinator, a } = await fixture(t);
      const app = await coordinatorServer(
        coordinator,
        new StaticBearerAuthenticator('test-token', DRIVER_ID)
      );
      t.after(async () => app.close());
      assert.equal((await app.inject('/v0.1/snapshot')).statusCode, 401);
      const headers = { authorization: 'Bearer test-token', 'idempotency-key': randomUUID() };
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/v0.1/bookings',
            headers,
            payload: { ...request(a), driverId: 'victim' },
          })
        ).statusCode,
        400
      );
      const accepted = await app.inject({
        method: 'POST',
        url: '/v0.1/bookings',
        headers,
        payload: request(a),
      });
      assert.equal(accepted.statusCode, 200);
      const publicRecord = accepted.json<{ id: string; driverId: string }>();
      assert.equal(publicRecord.driverId, DRIVER_ID);
      assert.ok(
        !accepted.body.includes('idempotencyKey') &&
          !accepted.body.includes('token') &&
          !accepted.body.includes('pendingAction')
      );
      await assert.rejects(
        coordinator.owned('another-driver', publicRecord.id),
        code('BOOKING_NOT_FOUND')
      );
    });

    test('HTTP provider adapter uses the same protocol and rejects missing provider credentials', async (t) => {
      const { harbour, a } = await fixture(t);
      const app = providerServer(harbour, 'provider-test');
      const url = await app.listen({ port: 0, host: '127.0.0.1' });
      t.after(async () => app.close());
      assert.equal((await app.inject('/v0.1/offers')).statusCode, 401);
      const adapter = new HttpProvider('harbour', 'Harbour Cooperative', url, 'provider-test');
      assert.equal((await adapter.offers()).length, 2);
      const bookingId = randomUUID();
      const token = randomUUID();
      assert.equal(
        (
          await adapter.prepare({
            bookingId,
            token,
            driverId: DRIVER_ID,
            offerId: a.id,
            offerVersion: 1,
          })
        ).state,
        'prepared'
      );
      assert.equal((await adapter.apply(bookingId, token, 'commit')).state, 'confirmed');
    });

    test('a delayed acknowledgement cannot regress a booking advanced by another worker', async (t) => {
      const { coordinator, store, fault, harbour, city, a } = await fixture(t);
      let release!: () => void;
      let prepared!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reached = new Promise<void>((resolve) => {
        prepared = resolve;
      });
      fault.afterPrepare = async () => {
        prepared();
        await gate;
      };
      const accepting = coordinator.accept(DRIVER_ID, randomUUID(), request(a));
      try {
        await reached;
        const active = await store.active(DRIVER_ID);
        assert.ok(active);
        const other = new Coordinator(store, [harbour, city]);
        await other.recover();
        await other.action(DRIVER_ID, active.id, 'start');
        await other.action(DRIVER_ID, active.id, 'complete');
        const events = await store.events(DRIVER_ID);
        release();
        assert.equal((await accepting).state, 'completed');
        assert.deepEqual(await store.events(DRIVER_ID), events);
        assert.equal(await store.active(DRIVER_ID), undefined);
      } finally {
        release();
        await accepting;
      }
    });

    test('two coordinator instances sharing authority arbitrate requests and idempotent retries', async (t) => {
      const { coordinator, store, storage, a, b } = await fixture(t);
      const otherStore = storageCase.coordinator === 'mongodb' ? await storage.openStore() : store;
      const other = new Coordinator(otherStore, coordinator.providers);
      const key = randomUUID();
      const results = await Promise.all([
        coordinator.accept(DRIVER_ID, key, request(a)),
        other.accept(DRIVER_ID, key, request(a)),
      ]);
      assert.equal(new Set(results.map((value) => value.id)).size, 1);
      await Promise.all([coordinator.recover(), other.recover()]);
      assert.equal((await store.active(DRIVER_ID))?.state, 'confirmed');
      assert.deepEqual(
        (await store.events(DRIVER_ID)).map((event) => event.bookingVersion),
        [1, 2, 3]
      );
      await assert.rejects(other.accept(DRIVER_ID, randomUUID(), request(b)), code('DRIVER_BUSY'));
    });

    test('mixed storage works through the unchanged HTTP booking and provider contracts', async (t) => {
      const { store, harbour, a } = await fixture(t);
      const providerApp = providerServer(harbour, 'wire-token');
      const url = await providerApp.listen({ port: 0, host: '127.0.0.1' });
      t.after(async () => providerApp.close());
      const provider = new HttpProvider('harbour', 'Harbour Cooperative', url, 'wire-token');
      const coordinator = new Coordinator(store, [provider]);
      const app = await coordinatorServer(
        coordinator,
        new StaticBearerAuthenticator('driver-token', DRIVER_ID)
      );
      t.after(async () => app.close());
      const headers = { authorization: 'Bearer driver-token', 'idempotency-key': randomUUID() };
      const response = await app.inject({
        method: 'POST',
        url: '/v0.1/bookings',
        headers,
        payload: request(a),
      });
      assert.equal(response.statusCode, 200);
      const booking = response.json<{ id: string; state: string }>();
      assert.equal(booking.state, 'confirmed');
      for (const action of ['start', 'complete']) {
        const result = await app.inject({
          method: 'POST',
          url: `/v0.1/bookings/${booking.id}/actions`,
          headers,
          payload: { action },
        });
        assert.equal(result.statusCode, 200);
      }
      assert.equal((await store.get(booking.id)).state, 'completed');
      assert.equal(await store.active(DRIVER_ID), undefined);
    });

    test('cancellation releases both claims while replay keeps the original booking identity', async (t) => {
      const { coordinator, harbour, store, a } = await fixture(t);
      const key = randomUUID();
      const first = await coordinator.accept(DRIVER_ID, key, request(a));
      await coordinator.action(DRIVER_ID, first.id, 'cancel');
      assert.equal(await store.active(DRIVER_ID), undefined);
      assert.ok((await harbour.offers()).some((offer) => offer.id === a.id));
      assert.equal((await coordinator.accept(DRIVER_ID, key, request(a))).id, first.id);
      const second = await coordinator.accept(DRIVER_ID, randomUUID(), request(a));
      assert.notEqual(second.id, first.id);
      assert.equal(second.state, 'confirmed');
    });
  });
}
