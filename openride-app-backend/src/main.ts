import { StaticBearerAuthenticator } from './authentication';
import { IntervalRecoveryScheduler } from './recovery-scheduler';
import { DRIVER_ID } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BookingStore } from './store';
import { Coordinator } from './coordinator';
import { HttpProvider } from './http-provider';
import { coordinatorServer } from './server';

const DATA_ROOT = resolve(process.env.DATA_ROOT ?? '.data');
await mkdir(DATA_ROOT, { recursive: true });
const STORE = await BookingStore.open(resolve(DATA_ROOT, 'coordinator'));
const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN ?? 'openride-demo-provider';
const PROVIDERS = [
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
  new StaticBearerAuthenticator(process.env.DRIVER_TOKEN ?? 'openride-demo-driver', DRIVER_ID),
  resolve('openride-app-frontend/build/web'),
  PROVIDERS
);
const ADDRESS = await APP.listen({
  port: Number(process.env.PORT ?? 4100),
  host: process.env.HOST ?? '127.0.0.1',
});
console.log(`OpenRide driver app: ${ADDRESS}`);
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
  await STORE.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
