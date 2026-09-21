import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

const ROOT = resolve('openride-design-system/catalog/build/web');
if (!existsSync(ROOT))
  throw new Error(
    'Build the catalogue first: cd openride-design-system/catalog && flutter build web --no-web-resources-cdn'
  );
const APP = Fastify();
await APP.register(fastifyStatic, { root: ROOT });
console.log(`OpenRide design system: ${await APP.listen({ port: 4200, host: '127.0.0.1' })}`);
process.on('SIGINT', async () => {
  await APP.close();
});
process.on('SIGTERM', async () => {
  await APP.close();
});
