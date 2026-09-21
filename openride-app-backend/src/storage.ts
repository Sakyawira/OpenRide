import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoBookingStore } from './mongo-booking-store';
import { MongoProviderStore } from './mongo-provider-store';
import { PgliteProviderStore } from './pglite-provider-store';
import type { BookingRepository, ProviderRepository } from './ports';
import { BookingStore } from './store';

export type StorageConfig =
  { adapter: 'pglite'; directory?: string } | { adapter: 'mongodb'; uri: string; database: string };

export function storageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  switch (env.STORAGE_ADAPTER ?? 'pglite') {
    case 'pglite':
      return { adapter: 'pglite', directory: resolve(env.DATA_ROOT ?? '.data') };
    case 'mongodb':
      if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required for STORAGE_ADAPTER=mongodb.');
      return {
        adapter: 'mongodb',
        uri: env.MONGODB_URI,
        database: env.MONGODB_DATABASE ?? 'openride',
      };
    default:
      throw new Error('STORAGE_ADAPTER must be pglite or mongodb.');
  }
}

async function participantPath(
  config: Extract<StorageConfig, { adapter: 'pglite' }>,
  name: string
): Promise<string | undefined> {
  if (!config.directory) return undefined;
  await mkdir(config.directory, { recursive: true });
  return resolve(config.directory, name);
}

export async function openBookingRepository(config: StorageConfig): Promise<BookingRepository> {
  return config.adapter === 'mongodb'
    ? MongoBookingStore.open(config.uri, config.database)
    : BookingStore.open(await participantPath(config, 'coordinator'));
}

export async function openProviderRepository(
  config: StorageConfig,
  id: string
): Promise<ProviderRepository> {
  if (!/^[a-z0-9_-]+$/.test(id)) throw new Error('Invalid provider storage namespace.');
  return config.adapter === 'mongodb'
    ? MongoProviderStore.open(config.uri, config.database, id)
    : PgliteProviderStore.open(await participantPath(config, id));
}
