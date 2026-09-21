import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test, type TestContext } from 'node:test';
import { OpenRideClient } from '@sakyawira/openride-protocol/client';
import type { Booking, RideRequest } from '@sakyawira/openride-protocol';
import { FixtureTokenAuthenticator } from '@/authentication';
import { Coordinator } from '@/coordinator';
import { startDemoNetwork } from '@/demo-network';
import { DemoProvider } from '@/provider';
import { RiderService } from '@/rider-service';
import { coordinatorServer } from '@/server';
import { createStorageHarness, STORAGE_CASES, type StorageCase } from './storage-harness';

async function fixture(t: TestContext, storageCase: StorageCase) {
  const storage = await createStorageHarness(t, storageCase);
  const network = storage.own(await startDemoNetwork(storage.providerConfig, 'provider'));
  const coordinator = new Coordinator(await storage.openStore(), network.adapters);
  const app = await coordinatorServer(
    coordinator,
    new FixtureTokenAuthenticator({
      'openride-demo-driver': 'open-driver',
      'mockride-demo-driver': 'mock-driver',
    }),
    undefined,
    [],
    [],
    {
      service: new RiderService(network.adapters),
      authenticator: new FixtureTokenAuthenticator({
        'openride-demo-rider': 'open-rider',
        'mockride-demo-rider': 'mock-rider',
      }),
    }
  );
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  storage.own({
    async close() {
      await app.close();
    },
  });
  const client = (token: string) => new OpenRideClient(url, token);
  return { app, url, client, coordinator };
}

for (const storageCase of STORAGE_CASES) {
  describe(`${storageCase.name}: rider/driver protocol`, () => {
    for (const [riderApp, driverApp] of [
      ['openride', 'mockride'],
      ['mockride', 'openride'],
    ] as const) {
      test(`${riderApp} rider -> ${driverApp} driver -> live completed journey`, async (t) => {
        const { url, client } = await fixture(t, storageCase);
        const rider = client(`${riderApp}-demo-rider`);
        const driver = client(`${driverApp}-demo-driver`);
        // Plain HTTP/JSON (as used by Flutter) creates the request; an independent
        // TypeScript client accepts it. No database identifiers cross the boundary.
        const created = await fetch(`${url}/v0.1/rider/requests`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${riderApp}-demo-rider`,
            'idempotency-key': randomUUID(),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            providerId: riderApp === 'openride' ? 'harbour' : 'city',
            pickup: `${riderApp} station`,
            destination: `${driverApp} square`,
          }),
        });
        assert.equal(created.status, 200);
        const ride = (await created.json()) as RideRequest;
        assert.equal(ride.status, 'searching');
        const offer = (await driver.driverSnapshot()).offers.find((value) => value.id === ride.id);
        assert.ok(offer);
        const booking = await driver.accept(offer, randomUUID());
        assert.equal(booking.state, 'confirmed');
        assert.equal((await rider.ride(ride.providerId, ride.id)).status, 'confirmed');
        await driver.action(booking.id, 'start');
        assert.equal((await rider.ride(ride.providerId, ride.id)).status, 'in_progress');
        await driver.action(booking.id, 'complete');
        assert.equal((await rider.riderSnapshot()).requests[0]?.status, 'completed');
        assert.equal((await driver.driverSnapshot()).activeBooking, null);
      });
    }

    test('providers own independent pricing and reject tampered quotes before publishing offers', async (t) => {
      const { app, client } = await fixture(t, storageCase);
      const rider = client('mockride-demo-rider');
      const route = { pickup: 'Britomart', destination: 'Parnell' };
      const openQuote = await rider.quote({ providerId: 'harbour', ...route });
      const mockQuote = await rider.quote({ providerId: 'city', ...route });
      assert.equal(openQuote.price.fareMinor, 1990);
      assert.equal(openQuote.price.payoutMinor, 1990);
      assert.equal(mockQuote.price.fareMinor, 1650);
      assert.equal(mockQuote.price.payoutMinor, 1500);
      const input = { providerId: 'city', ...route, expectedPrice: mockQuote.price };
      const forged = await app.inject({
        method: 'POST',
        url: '/v0.1/rider/requests',
        headers: { authorization: 'Bearer mockride-demo-rider', 'idempotency-key': randomUUID() },
        payload: { ...input, expectedPrice: { ...mockQuote.price, fareMinor: 1 } },
      });
      assert.equal(forged.statusCode, 409);
      assert.equal((await rider.riderSnapshot()).requests.length, 0);
      const ride = await rider.requestRide(input, randomUUID());
      assert.equal(ride.fareMinor, 1650);
      const driver = client('openride-demo-driver');
      const offer = (await driver.driverSnapshot()).offers.find((value) => value.id === ride.id)!;
      assert.equal(offer.payoutMinor, 1500);
      assert.equal((await driver.accept(offer, randomUUID())).offer.payoutMinor, 1500);
    });

    test('pricing changes require a new quote; saved fares and replay keys survive changes and reopen', async (t) => {
      const storage = await createStorageHarness(t, storageCase);
      let amount = 2200;
      const pricing = {
        async quote() {
          return {
            fareMinor: amount,
            payoutMinor: amount - 200,
            currency: 'NZD',
            pricingVersion: `tariff-${amount}`,
          };
        },
      };
      let provider = new DemoProvider(
        'harbour',
        'Provider',
        await storage.openProviderStore('harbour'),
        pricing
      );
      const route = { pickup: 'Britomart', destination: 'Newmarket' };
      const oldQuote = await provider.quote(route);
      amount = 2500;
      const input = {
        ...route,
        riderId: 'rider',
        requestKey: randomUUID(),
        expectedPrice: oldQuote.price,
      };
      await assert.rejects(provider.requestRide(input), /price changed/);
      assert.equal((await provider.rides('rider')).length, 0);
      input.expectedPrice = (await provider.quote(route)).price;
      const saved = await provider.requestRide(input);
      amount = 3000;
      await provider.close();
      provider = new DemoProvider(
        'harbour',
        'Provider',
        await storage.openProviderStore('harbour'),
        pricing
      );
      const replay = await provider.requestRide(input);
      assert.equal(replay.id, saved.id);
      assert.equal(replay.fareMinor, 2500);
      assert.equal((await provider.getOffer(saved.id)).payoutMinor, 2300);
      await assert.rejects(
        provider.requestRide({ ...input, expectedPrice: (await provider.quote(route)).price }),
        /different pricing/
      );
    });

    test('map coordinates survive quote, request and booking; changed pins and invalid coordinates are rejected', async (t) => {
      const { app, client } = await fixture(t, storageCase);
      const rider = client('openride-demo-rider');
      const input = {
        providerId: 'harbour',
        pickup: 'Britomart',
        destination: 'Newmarket',
        locations: {
          pickup: { latitude: -36.844, longitude: 174.768 },
          destination: { latitude: -36.869, longitude: 174.778 },
        },
      };
      const quote = await rider.quote(input);
      assert.deepEqual(quote.locations, input.locations);
      const key = randomUUID();
      const ride = await rider.requestRide({ ...input, expectedPrice: quote.price }, key);
      assert.deepEqual(ride.locations, input.locations);
      const driver = client('mockride-demo-driver');
      const offer = (await driver.driverSnapshot()).offers.find((item) => item.id === ride.id)!;
      const booking = await driver.accept(offer, randomUUID());
      assert.deepEqual(booking.offer.locations, input.locations);
      await assert.rejects(
        rider.requestRide(
          {
            ...input,
            locations: { ...input.locations, pickup: { latitude: -36.84, longitude: 174.768 } },
          },
          key
        ),
        /another route/
      );
      const invalid = await app.inject({
        method: 'POST',
        url: '/v0.1/rider/quotes',
        headers: { authorization: 'Bearer openride-demo-rider' },
        payload: {
          ...input,
          locations: { ...input.locations, pickup: { latitude: 190, longitude: 400 } },
        },
      });
      assert.equal(invalid.statusCode, 400);
    });

    test('two different driver apps cannot both accept the same rider request', async (t) => {
      const { client } = await fixture(t, storageCase);
      const rider = client('openride-demo-rider');
      const ride = await rider.requestRide(
        { providerId: 'harbour', pickup: 'Britomart', destination: 'Parnell' },
        randomUUID()
      );
      const first = client('openride-demo-driver');
      const second = client('mockride-demo-driver');
      const offer = (await first.driverSnapshot()).offers.find((value) => value.id === ride.id);
      assert.ok(offer);
      const results = await Promise.all([
        first.accept(offer, randomUUID()),
        second.accept(offer, randomUUID()),
      ]);
      assert.deepEqual(results.map((value) => value.state).sort(), ['confirmed', 'rejected']);
      assert.equal((await rider.ride(ride.providerId, ride.id)).status, 'confirmed');
    });

    test('rider replay keys, role separation, ownership and identity validation hold over HTTP', async (t) => {
      const { app, client } = await fixture(t, storageCase);
      const rider = client('openride-demo-rider');
      const input = { providerId: 'harbour', pickup: 'Britomart', destination: 'Newmarket' };
      const key = randomUUID();
      const created = await Promise.all(
        Array.from({ length: 5 }, () => rider.requestRide(input, key))
      );
      assert.equal(new Set(created.map((value) => value.id)).size, 1);
      assert.equal((await rider.riderSnapshot()).requests.length, 1);
      await assert.rejects(
        rider.requestRide({ ...input, destination: 'Ponsonby' }, key),
        /another route/
      );
      const ride = created[0]!;
      const privateRoute = `/v0.1/rider/requests/${ride.providerId}/${ride.id}`;
      assert.equal(
        (
          await app.inject({
            url: privateRoute,
            headers: { authorization: 'Bearer mockride-demo-rider' },
          })
        ).statusCode,
        404
      );
      assert.equal(
        (
          await app.inject({
            url: privateRoute,
            headers: { authorization: 'Bearer openride-demo-driver' },
          })
        ).statusCode,
        401
      );
      assert.equal(
        (
          await app.inject({
            url: '/v0.1/snapshot',
            headers: { authorization: 'Bearer openride-demo-rider' },
          })
        ).statusCode,
        401
      );
      const spoofed = await app.inject({
        method: 'POST',
        url: '/v0.1/rider/requests',
        headers: {
          authorization: 'Bearer openride-demo-rider',
          'idempotency-key': randomUUID(),
        },
        payload: { ...input, riderId: 'mock-rider' },
      });
      assert.equal(spoofed.statusCode, 400);
      assert.ok(
        !JSON.stringify(ride).includes('riderId') && !JSON.stringify(ride).includes('requestKey')
      );
    });

    test('driver cancellation makes the original rider request available to the other app', async (t) => {
      const { client } = await fixture(t, storageCase);
      const rider = client('mockride-demo-rider');
      const driver = client('openride-demo-driver');
      const alternate = client('mockride-demo-driver');
      const ride = await rider.requestRide(
        { providerId: 'city', pickup: 'Commercial Bay', destination: 'Mount Eden' },
        randomUUID()
      );
      const offer = (await driver.driverSnapshot()).offers.find((value) => value.id === ride.id)!;
      const booking: Booking = await driver.accept(offer, randomUUID());
      await driver.action(booking.id, 'cancel');
      assert.equal((await rider.ride(ride.providerId, ride.id)).status, 'searching');
      await alternate.accept(offer, randomUUID());
      assert.equal((await rider.ride(ride.providerId, ride.id)).status, 'confirmed');
    });
  });
}
