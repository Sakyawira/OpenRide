import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DemoProvider } from './provider';
import { providerServer } from './server';

const ID = process.env.PROVIDER_ID ?? 'harbour';
if (!['harbour', 'city'].includes(ID)) throw new Error('PROVIDER_ID must be harbour or city.');
const DATA_ROOT = resolve(process.env.DATA_ROOT ?? '.data');
await mkdir(DATA_ROOT, { recursive: true });
const PROVIDER = await DemoProvider.open(
  ID,
  ID === 'harbour' ? 'Harbour Cooperative' : 'City Cooperative',
  resolve(DATA_ROOT, ID)
);
await PROVIDER.seedIfEmpty();
const APP = providerServer(PROVIDER, process.env.PROVIDER_TOKEN ?? 'openride-demo-provider');
const ADDRESS = await APP.listen({
  port: Number(process.env.PROVIDER_PORT ?? (ID === 'harbour' ? 4101 : 4102)),
  host: '127.0.0.1',
});
console.log(`${PROVIDER.name}: ${ADDRESS}`);
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await APP.close();
  await PROVIDER.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
