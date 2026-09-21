import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROTOCOL_VERSION } from '@sakyawira/openride-protocol';
import { OpenRideClient } from '@sakyawira/openride-protocol/client';

test('browser fetch retains its global receiver for rider and driver requests', async (t) => {
  const transport = t.mock.method(
    globalThis,
    'fetch',
    async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      // Browsers reject fetch invoked as a method of an arbitrary client object.
      assert.equal(this, globalThis);
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer demo-token');
      const url = new URL(String(input));
      return Response.json({
        protocolVersion: PROTOCOL_VERSION,
        providers: [],
        ...(url.pathname.includes('/rider/')
          ? { requests: [] }
          : { driverId: 'demo-driver', offers: [], activeBooking: null }),
      });
    }
  );
  const client = new OpenRideClient('https://openride.example', 'demo-token');
  assert.deepEqual((await client.riderSnapshot()).requests, []);
  assert.deepEqual((await client.driverSnapshot()).offers, []);
  assert.equal(transport.mock.callCount(), 2);
});
