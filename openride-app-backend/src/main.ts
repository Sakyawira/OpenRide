import { FixtureTokenAuthenticator } from './authentication';
import { IntervalRecoveryScheduler } from './recovery-scheduler';
import { DRIVER_ID } from './fixtures';
import { resolve } from 'node:path';
import { Coordinator } from './coordinator';
import { HttpProvider } from './http-provider';
import { coordinatorServer } from './server';
import { startDemoNetwork } from './demo-network';
import { openBookingRepository, storageConfig } from './storage';
import { RiderService } from './rider-service';
import { readFile } from 'node:fs/promises';

const CONFIG = storageConfig();
const STORE = await openBookingRepository(CONFIG);
const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN ?? 'openride-demo-provider';
const NETWORK =
  process.env.DEMO_PROVIDERS === 'embedded'
    ? await startDemoNetwork(CONFIG, PROVIDER_TOKEN)
    : undefined;
const PROVIDERS = NETWORK?.adapters ?? [
  new HttpProvider(
    'harbour',
    'Harbour Cooperative',
    process.env.HARBOUR_URL ?? 'http://127.0.0.1:4101',
    PROVIDER_TOKEN
  ),
  new HttpProvider(
    'city',
    'City Cooperative',
    process.env.CITY_URL ?? 'http://127.0.0.1:4102',
    PROVIDER_TOKEN
  ),
];
const COORDINATOR = new Coordinator(STORE, PROVIDERS);
const APP = await coordinatorServer(
  COORDINATOR,
  new FixtureTokenAuthenticator({
    [process.env.DRIVER_TOKEN ?? 'openride-demo-driver']: DRIVER_ID,
    [process.env.MOCK_DRIVER_TOKEN ?? 'mockride-demo-driver']: 'mock-driver',
  }),
  resolve('openride-driver-frontend/build/web'),
  PROVIDERS,
  (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  {
    service: new RiderService(PROVIDERS),
    authenticator: new FixtureTokenAuthenticator({
      [process.env.RIDER_TOKEN ?? 'openride-demo-rider']: 'demo-rider',
      [process.env.MOCK_RIDER_TOKEN ?? 'mockride-demo-rider']: 'mock-rider',
    }),
  },
  [
    { root: resolve('openride-rider-frontend/build/web'), prefix: '/rider/' },
    { root: resolve('mockride-driver-frontend/dist'), prefix: '/mockride/driver/' },
    { root: resolve('mockride-rider-frontend/dist'), prefix: '/mockride/rider/' },
  ]
);
APP.get('/apps', async (_request, reply) =>
  reply.type('text/html').send(await readFile('openride-app-backend/public/launcher.html', 'utf8'))
);
const ADDRESS = await APP.listen({
  port: Number(process.env.PORT ?? 4100),
  host: process.env.HOST ?? '127.0.0.1',
});
console.log(`OpenRide demo apps: ${ADDRESS}/apps`);
const SCHEDULER = new IntervalRecoveryScheduler(5000, (error) => {
  console.error('Recovery failed:', error instanceof Error ? error.message : 'Unknown error');
});
SCHEDULER.start(() => COORDINATOR.recover());
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await SCHEDULER.stop();
  await APP.close();
  await COORDINATOR.idle();
  await NETWORK?.close();
  await STORE.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
