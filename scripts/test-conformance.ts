import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, open } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { MongoClient } from 'mongodb';

async function runTests(uri: string): Promise<number> {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      '--test-concurrency=1',
      ...['booking', 'storage', 'hosted'].map(
        (name) => `openride-app-backend/test/${name}.test.ts`
      ),
    ],
    { stdio: 'inherit', env: { ...process.env, TEST_MONGODB_URI: uri } }
  );
  const [code] = await once(child, 'exit');
  return typeof code === 'number' ? code : 1;
}

async function localReplicaSet(): Promise<number> {
  const directory = await mkdtemp(join(tmpdir(), 'openride-mongodb-'));
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate MongoDB port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve()))
  );
  const docker = process.env.MONGODB_TEST_MODE === 'docker';
  const name = `openride-test-${process.pid}`;
  const log = await open(join(directory, 'mongod.log'), 'w');
  const child = docker
    ? spawn(
        'docker',
        [
          'run',
          '--rm',
          '--name',
          name,
          '-p',
          `127.0.0.1:${port}:27017`,
          'mongo:8.2',
          '--replSet',
          'openride',
          '--bind_ip_all',
          '--wiredTigerCacheSizeGB',
          '0.25',
        ],
        { stdio: ['ignore', log.fd, log.fd] }
      )
    : spawn(
        process.env.MONGOD_BINARY ?? 'mongod',
        [
          '--dbpath',
          directory,
          '--port',
          String(port),
          '--bind_ip',
          '127.0.0.1',
          '--replSet',
          'openride',
          '--wiredTigerCacheSizeGB',
          '0.25',
          '--quiet',
        ],
        { stdio: ['ignore', log.fd, log.fd] }
      );
  let startupError: Error | undefined;
  child.on('error', (error) => {
    startupError = error;
  });
  const uri = `mongodb://127.0.0.1:${port}/?directConnection=true`;
  try {
    const deadline = Date.now() + 120_000;
    let initiated = false;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      if (startupError)
        throw new Error(
          'Install mongod, set MONGOD_BINARY, use MONGODB_TEST_MODE=docker, or supply TEST_MONGODB_URI.',
          { cause: startupError }
        );
      if (child.exitCode !== null)
        throw new Error(`MongoDB exited during startup; see ${directory}/mongod.log`);
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 500 });
      try {
        await client.connect();
        if (!initiated) {
          await client.db('admin').command({
            replSetInitiate: {
              _id: 'openride',
              members: [{ _id: 0, host: `127.0.0.1:${docker ? 27017 : port}` }],
            },
          });
          initiated = true;
        }
        const hello = await client.db('admin').command({ hello: 1 });
        ready = hello.isWritablePrimary === true;
      } catch (error) {
        if (initiated) throw error;
        // A new process/container may not yet be listening.
      } finally {
        await client.close();
      }
      if (!ready) await delay(200);
    }
    if (!ready) throw new Error(`MongoDB did not become primary; see ${directory}/mongod.log`);
    console.log(
      'Conformance: real MongoDB replica set + PGlite, including both mixed combinations.'
    );
    return await runTests(`${uri}&replicaSet=openride`);
  } finally {
    if (docker) {
      const stop = spawn('docker', ['rm', '--force', name], { stdio: 'ignore' });
      await once(stop, 'exit');
    } else if (child.exitCode === null && !startupError) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    await log.close();
    await rm(directory, { recursive: true, force: true });
  }
}

process.exitCode = process.env.TEST_MONGODB_URI
  ? await runTests(process.env.TEST_MONGODB_URI)
  : await localReplicaSet();
