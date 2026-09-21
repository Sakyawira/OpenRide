import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import {
  ACCEPT_SCHEMA,
  ID_SCHEMA,
  PREPARE_SCHEMA,
  PROTOCOL_VERSION,
  PROVIDER_ACTION_SCHEMA,
  ProtocolError,
  TRIP_ACTION_SCHEMA,
} from '@sakyawira/openride-protocol';
import { publicBooking } from './domain';
import type { Coordinator } from './coordinator';
import type { DriverAuthenticator, ProviderAdapter, DemoOfferSeeder } from './ports';
import { StaticBearerAuthenticator } from './authentication';

declare module 'fastify' {
  interface FastifyRequest {
    principalId: string;
  }
}

function baseServer(authenticator: DriverAuthenticator): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  app.decorateRequest('principalId', '');
  app.addHook('onRequest', async (request) => {
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/v0.1/') && !path.startsWith('/demo/')) return;
    request.principalId = await authenticator.authenticate(request.headers.authorization);
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ProtocolError)
      return reply.code(error.status).send({ code: error.code, message: error.message });
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ code: 'INVALID_REQUEST', message: 'Request fields are missing or invalid.' });
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode < 500
    ) {
      return reply
        .code(error.statusCode)
        .send({ code: 'INVALID_REQUEST', message: 'Invalid HTTP request.' });
    }
    // Do not expose provider URLs, tokens or database internals to clients.
    console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error');
    return reply.code(503).send({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service unavailable. Retry using the same request key.',
    });
  });
  app.get('/health', async () => ({ ok: true, protocolVersion: PROTOCOL_VERSION }));
  return app;
}

export async function coordinatorServer(
  coordinator: Coordinator,
  authenticator: DriverAuthenticator,
  webRoot?: string,
  seeders: DemoOfferSeeder[] = []
): Promise<FastifyInstance> {
  const app = baseServer(authenticator);
  app.get('/v0.1/snapshot', async (request) => ({
    protocolVersion: PROTOCOL_VERSION,
    ...(await coordinator.snapshot(request.principalId)),
  }));
  app.get('/v0.1/events', async (request) => {
    const { after } = z
      .object({ after: z.coerce.number().int().min(0).max(2_147_483_647).default(0) })
      .parse(request.query);
    return { events: await coordinator.store.events(request.principalId, after) };
  });
  app.post('/v0.1/bookings', async (request, reply) => {
    const key = ID_SCHEMA.parse(request.headers['idempotency-key']);
    const record = await coordinator.accept(
      request.principalId,
      key,
      ACCEPT_SCHEMA.parse(request.body)
    );
    return reply.code(record.pendingAction ? 202 : 200).send(publicBooking(record));
  });
  app.get('/v0.1/bookings/:id', async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    return publicBooking(await coordinator.owned(request.principalId, id));
  });
  app.post('/v0.1/bookings/:id/reconcile', async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    await coordinator.owned(request.principalId, id);
    return publicBooking(await coordinator.reconcile(id));
  });
  app.post('/v0.1/bookings/:id/actions', async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { action } = z.object({ action: TRIP_ACTION_SCHEMA }).strict().parse(request.body);
    return publicBooking(await coordinator.action(request.principalId, id, action));
  });
  app.post('/demo/offers', async () => {
    const results = await Promise.allSettled(seeders.map((provider) => provider.seed()));
    return {
      created: results.filter((result) => result.status === 'fulfilled').length,
      total: results.length,
    };
  });
  if (webRoot && existsSync(webRoot)) await app.register(fastifyStatic, { root: webRoot });
  else
    app.get('/', async (_request, reply) =>
      reply
        .type('text/plain')
        .send(
          'OpenRide coordinator is running. Build the driver app: cd openride-app-frontend && flutter build web'
        )
    );
  return app;
}

export function providerServer(
  provider: ProviderAdapter & DemoOfferSeeder,
  token: string
): FastifyInstance {
  const app = baseServer(new StaticBearerAuthenticator(token, 'coordinator'));
  app.get('/v0.1/offers', async () => provider.offers());
  app.get('/v0.1/offers/:id', async (request) => {
    const { id } = z.object({ id: ID_SCHEMA }).parse(request.params);
    return provider.getOffer(id);
  });
  app.post('/v0.1/reservations', async (request) =>
    provider.prepare(PREPARE_SCHEMA.parse(request.body))
  );
  app.post('/v0.1/reservations/:id/actions', async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { token, action } = z
      .object({ token: z.string().min(32).max(100), action: PROVIDER_ACTION_SCHEMA })
      .strict()
      .parse(request.body);
    return provider.apply(id, token, action);
  });
  app.post('/demo/offers', async () => {
    await provider.seed();
    return { ok: true };
  });
  return app;
}
