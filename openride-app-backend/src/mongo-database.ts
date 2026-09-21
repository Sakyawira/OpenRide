import { MongoClient, MongoServerError, type ClientSession, type Db } from 'mongodb';

export function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

/** Owns one adapter's connection; never leaks database types into the protocol/domain. */
export class MongoDatabase {
  private constructor(
    private readonly client: MongoClient,
    readonly db: Db
  ) {}

  static async open(uri: string, database: string): Promise<MongoDatabase> {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10_000,
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority' },
    });
    try {
      await client.connect();
      const db = client.db(database);
      const hello = await db.command({ hello: 1 });
      if (!hello.setName && hello.msg !== 'isdbgrid') {
        throw new Error(
          'MongoDB requires a replica set (including a local single-node replica set) or a sharded cluster for atomic booking/event transactions.'
        );
      }
      return new MongoDatabase(client, db);
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.client.startSession();
    try {
      // The driver retries write conflicts and ambiguous commits. Callbacks must be pure
      // apart from database writes in this session; external provider calls stay outside.
      return await session.withTransaction(work, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        timeoutMS: 15_000,
      });
    } finally {
      await session.endSession();
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
