import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { OFFER_SCHEMA } from '@sakyawira/openride-protocol';

const URL = process.env.OPENRIDE_URL ?? 'http://127.0.0.1:4100';
const HEADERS = {
  authorization: `Bearer ${process.env.DRIVER_TOKEN ?? 'openride-demo-driver'}`,
  'content-type': 'application/json',
};
const SNAPSHOT_RESPONSE = await fetch(`${URL}/v0.1/snapshot`, { headers: HEADERS });
if (!SNAPSHOT_RESPONSE.ok) throw new Error(`Snapshot failed: ${SNAPSHOT_RESPONSE.status}`);
const SNAPSHOT = z
  .object({ activeBooking: z.unknown(), offers: OFFER_SCHEMA.array() })
  .parse(await SNAPSHOT_RESPONSE.json());
if (SNAPSHOT.activeBooking)
  throw new Error('Finish or cancel the active demo booking before running the race.');
const FIRST = SNAPSHOT.offers[0];
const SECOND = SNAPSHOT.offers.find((offer) => offer.providerId !== FIRST?.providerId);
if (!FIRST || !SECOND)
  throw new Error('Use “New demo offers” in the driver app first. Both providers need an offer.');
const RESULTS = await Promise.all(
  [FIRST, SECOND].map(async (offer) => {
    const response = await fetch(`${URL}/v0.1/bookings`, {
      method: 'POST',
      headers: { ...HEADERS, 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        providerId: offer.providerId,
        offerId: offer.id,
        offerVersion: offer.version,
      }),
    });
    return {
      provider: offer.providerName,
      status: response.status,
      result: (await response.json()) as unknown,
    };
  })
);
console.log(JSON.stringify(RESULTS, null, 2));
if (
  RESULTS.filter((result) => result.status === 200 || result.status === 202).length !== 1 ||
  RESULTS.filter((result) => result.status === 409).length !== 1
) {
  throw new Error('Expected one booking and one DRIVER_BUSY response.');
}
console.log('PASS: one driver, one booking. Finish the winning trip in the app.');
