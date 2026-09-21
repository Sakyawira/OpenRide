import { DemoProvider } from './provider';
import { providerServer } from './server';
import { openProviderRepository, storageConfig } from './storage';

const ID = process.env.PROVIDER_ID ?? 'harbour';
if (!['harbour', 'city'].includes(ID)) throw new Error('PROVIDER_ID must be harbour or city.');
const PROVIDER = new DemoProvider(
  ID,
  ID === 'harbour' ? 'Harbour Cooperative' : 'City Cooperative',
  await openProviderRepository(storageConfig(), ID)
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
