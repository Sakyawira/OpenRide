import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { Booking, Offer } from '@sakyawira/openride-protocol';
import { createStorageHarness, STORAGE_CASES } from './storage-harness';

for (const storageCase of STORAGE_CASES.filter((entry) => entry.coordinator === entry.provider)) {
  test(`${storageCase.coordinator}: hosted single-process demo survives a complete restart`, async (t) => {
    const harness = await createStorageHarness(t, storageCase);
    const config = harness.coordinatorConfig;
    async function start() {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'openride-app-backend/src/main.ts'],
        {
          env: {
            ...process.env,
            PORT: '0',
            HOST: '127.0.0.1',
            DEMO_PROVIDERS: 'embedded',
            STORAGE_ADAPTER: config.adapter,
            DRIVER_TOKEN: 'hosted-test',
            PROVIDER_TOKEN: 'provider-test',
            CORS_ORIGINS: 'https://example.test',
            ...(config.adapter === 'mongodb'
              ? { MONGODB_URI: config.uri, MONGODB_DATABASE: config.database }
              : { DATA_ROOT: config.directory }),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      let output = '';
      let failed = '';
      let launchError: Error | undefined;
      child.on('error', (error) => {
        launchError = error;
      });
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        failed += chunk.toString();
      });
      async function stop() {
        if (child.exitCode === null && child.signalCode === null && !launchError) {
          child.kill('SIGTERM');
          await once(child, 'exit');
        }
      }
      t.after(stop);
      const deadline = Date.now() + 30_000;
      while (!output.includes('OpenRide driver app:') && Date.now() < deadline) {
        if (launchError) throw launchError;
        if (child.exitCode !== null) throw new Error(`Hosted demo exited: ${failed}`);
        await delay(100);
      }
      const url = /OpenRide driver app: (http:\/\/[^\s]+)/.exec(output)?.[1];
      assert.ok(url, `Hosted demo did not become ready: ${failed}`);
      return { url, stop };
    }
    const first = await start();
    const headers = {
      authorization: 'Bearer hosted-test',
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    };
    const preflight = await fetch(`${first.url}/v0.1/bookings`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://example.test',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,idempotency-key',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://example.test');
    const snapshot = (await (await fetch(`${first.url}/v0.1/snapshot`, { headers })).json()) as {
      offers: Offer[];
    };
    const offer = snapshot.offers[0];
    assert.ok(offer);
    const accepted = await fetch(`${first.url}/v0.1/bookings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        providerId: offer.providerId,
        offerId: offer.id,
        offerVersion: offer.version,
      }),
    });
    assert.equal(accepted.status, 200);
    const booking = (await accepted.json()) as Booking;
    await first.stop();
    const second = await start();
    const recovered = (await (
      await fetch(`${second.url}/v0.1/bookings/${booking.id}`, { headers })
    ).json()) as Booking;
    assert.equal(recovered.state, 'confirmed');
    for (const action of ['start', 'complete']) {
      const response = await fetch(`${second.url}/v0.1/bookings/${booking.id}/actions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action }),
      });
      assert.equal(response.status, 200);
    }
    const finished = (await (await fetch(`${second.url}/v0.1/snapshot`, { headers })).json()) as {
      activeBooking: Booking | null;
      offers: Offer[];
    };
    assert.equal(finished.activeBooking, null);
    assert.ok(!finished.offers.some((candidate) => candidate.id === offer.id));
    await second.stop();
  });
}
