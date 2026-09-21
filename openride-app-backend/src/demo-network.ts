import type { FastifyInstance } from 'fastify';
import { HttpProvider } from './http-provider';
import { DemoProvider } from './provider';
import { providerServer } from './server';
import { openProviderRepository, type StorageConfig } from './storage';

/** Both fixtures share one hosting process, but still speak the protocol over HTTP.
 * Their repositories own separate tables/collections and transactions.
 */
export async function startDemoNetwork(config: StorageConfig, token: string) {
  const providers: DemoProvider[] = [];
  const servers: FastifyInstance[] = [];
  const adapters: HttpProvider[] = [];
  async function close(): Promise<void> {
    for (const server of servers) await server.close();
    for (const provider of providers) await provider.close();
  }
  try {
    for (const [id, name] of [
      ['harbour', 'Harbour Cooperative'],
      ['city', 'City Cooperative'],
    ] as const) {
      const provider = new DemoProvider(id, name, await openProviderRepository(config, id));
      providers.push(provider);
      await provider.seedIfEmpty();
      const server = providerServer(provider, token);
      servers.push(server);
      const url = await server.listen({ host: '127.0.0.1', port: 0 });
      adapters.push(new HttpProvider(id, name, url, token));
    }
    return { adapters, close };
  } catch (error) {
    await close();
    throw error;
  }
}
