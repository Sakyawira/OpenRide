import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { MongoClient } from 'mongodb';
import { openBookingRepository, openProviderRepository, type StorageConfig } from '@/storage';

type Adapter = StorageConfig['adapter'];
export interface StorageCase {
  name: string;
  coordinator: Adapter;
  provider: Adapter;
}

const ADAPTERS: Adapter[] = process.env.TEST_MONGODB_URI ? ['pglite', 'mongodb'] : ['pglite'];
export const STORAGE_CASES: StorageCase[] = ADAPTERS.flatMap((coordinator) =>
  ADAPTERS.map((provider) => ({
    name: `${coordinator} coordinator / ${provider} providers`,
    coordinator,
    provider,
  }))
);

export async function createStorageHarness(t: TestContext, storageCase: StorageCase) {
  const directory = await mkdtemp(join(tmpdir(), 'openride-conformance-'));
  const database = `openride_test_${randomUUID().replaceAll('-', '')}`;
  const resources: { close(): Promise<void> }[] = [];
  function config(adapter: Adapter): StorageConfig {
    if (adapter === 'pglite') return { adapter, directory };
    const uri = process.env.TEST_MONGODB_URI;
    if (!uri) throw new Error('TEST_MONGODB_URI is required for MongoDB conformance tests.');
    return { adapter, uri, database };
  }
  function own<T extends { close(): Promise<void> }>(resource: T): T {
    const close = resource.close.bind(resource);
    let closed = false;
    resource.close = async () => {
      if (closed) return;
      await close();
      closed = true;
    };
    resources.push(resource);
    return resource;
  }
  t.after(async () => {
    for (const resource of resources.reverse()) await resource.close();
    if (storageCase.coordinator === 'mongodb' || storageCase.provider === 'mongodb') {
      const client = new MongoClient(process.env.TEST_MONGODB_URI!);
      try {
        // Only this test's freshly allocated database is removed.
        await client.db(database).dropDatabase();
      } finally {
        await client.close();
      }
    }
    await rm(directory, { recursive: true, force: true });
  });
  return {
    own,
    coordinatorConfig: config(storageCase.coordinator),
    providerConfig: config(storageCase.provider),
    async openStore() {
      return own(await openBookingRepository(config(storageCase.coordinator)));
    },
    async openProviderStore(id: string) {
      return own(await openProviderRepository(config(storageCase.provider), id));
    },
  };
}
