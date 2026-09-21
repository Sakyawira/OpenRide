import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  ACCEPT_SCHEMA,
  ID_SCHEMA,
  OFFER_SCHEMA,
  PREPARE_SCHEMA,
  PROTOCOL_VERSION,
  PROVIDER_ACTION_SCHEMA,
  PROVIDER_RESERVATION_SCHEMA,
  TRIP_ACTION_SCHEMA,
} from '@sakyawira/openride-protocol';

const BOOKING_SCHEMA = z.object({
  id: z.uuid(),
  driverId: ID_SCHEMA,
  providerId: ID_SCHEMA,
  offer: OFFER_SCHEMA,
  state: z.enum([
    'preparing',
    'resolving',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'rejected',
  ]),
  version: z.number().int().positive(),
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
const EVENT_SCHEMA = z.object({
  sequence: z.number().int().positive(),
  type: z.string(),
  bookingId: z.uuid(),
  bookingVersion: z.number().int().positive(),
  occurredAt: z.iso.datetime(),
});
const SCHEMAS = {
  Offer: OFFER_SCHEMA,
  AcceptRequest: ACCEPT_SCHEMA,
  PrepareRequest: PREPARE_SCHEMA,
  ProviderReservation: PROVIDER_RESERVATION_SCHEMA,
  Booking: BOOKING_SCHEMA,
  TripAction: z.object({ action: TRIP_ACTION_SCHEMA }).strict(),
  ProviderAction: z
    .object({ token: z.string().min(32).max(100), action: PROVIDER_ACTION_SCHEMA })
    .strict(),
  Error: z.object({ code: z.string(), message: z.string() }),
  Snapshot: z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    driverId: ID_SCHEMA,
    activeBooking: BOOKING_SCHEMA.nullable(),
    offers: OFFER_SCHEMA.array(),
    providers: z.object({ id: ID_SCHEMA, name: z.string(), available: z.boolean() }).array(),
  }),
  Events: z.object({ events: EVENT_SCHEMA.array() }),
};
function schemaRef(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}
function response(name: string, description: string) {
  return { description, content: { 'application/json': { schema: schemaRef(name) } } };
}
function operation(id: string, tag: 'Driver' | 'Provider', result: string, body?: string) {
  return {
    operationId: id,
    tags: [tag],
    security: [{ [tag === 'Driver' ? 'DriverToken' : 'ProviderToken']: [] }],
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: schemaRef(body) } },
          },
        }
      : {}),
    responses: {
      '200': response(
        result,
        'Current result. Inspect booking state for unresolved or rejected outcomes.'
      ),
      '400': response('Error', 'Invalid request'),
      '401': response('Error', 'Invalid credentials'),
      '404': response('Error', 'Not found'),
      '409': response('Error', 'Conflict'),
      '502': response('Error', 'Invalid provider response'),
      '503': response('Error', 'Service unavailable'),
    },
  };
}
const ID_PARAM = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const ACCEPT = operation('acceptOffer', 'Driver', 'Booking', 'AcceptRequest');
const SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'OpenRide Protocol',
    version: PROTOCOL_VERSION,
    description:
      'Experimental reference contract. Driver and provider operations live on different participants. Demo-only fixture endpoints are excluded.',
  },
  servers: [{ url: 'http://127.0.0.1:4100', description: 'Driver coordinator' }],
  tags: [{ name: 'Driver' }, { name: 'Provider' }],
  paths: {
    '/v0.1/snapshot': { get: operation('driverSnapshot', 'Driver', 'Snapshot') },
    '/v0.1/events': {
      get: {
        ...operation('driverEvents', 'Driver', 'Events'),
        parameters: [
          {
            name: 'after',
            in: 'query',
            schema: { type: 'integer', minimum: 0, maximum: 2147483647, default: 0 },
            description: 'Exclusive cursor. Up to 200 events per page.',
          },
        ],
      },
    },
    '/v0.1/bookings': {
      post: {
        ...ACCEPT,
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: z.toJSONSchema(ID_SCHEMA),
          },
        ],
        responses: {
          ...ACCEPT.responses,
          '202': response('Booking', 'Driver remains reserved; provider confirmation is pending.'),
        },
      },
    },
    '/v0.1/bookings/{id}': {
      parameters: [ID_PARAM],
      get: operation('readBooking', 'Driver', 'Booking'),
    },
    '/v0.1/bookings/{id}/reconcile': {
      parameters: [ID_PARAM],
      post: operation('reconcileBooking', 'Driver', 'Booking'),
    },
    '/v0.1/bookings/{id}/actions': {
      parameters: [ID_PARAM],
      post: operation('tripAction', 'Driver', 'Booking', 'TripAction'),
    },
    '/v0.1/offers': {
      servers: [{ url: 'http://127.0.0.1:4101' }],
      get: {
        ...operation('listOffers', 'Provider', 'Offer'),
        responses: {
          '200': {
            description: 'Available offers',
            content: {
              'application/json': { schema: { type: 'array', items: schemaRef('Offer') } },
            },
          },
          '401': response('Error', 'Invalid credentials'),
        },
      },
    },
    '/v0.1/offers/{id}': {
      servers: [{ url: 'http://127.0.0.1:4101' }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: z.toJSONSchema(ID_SCHEMA) }],
      get: operation('readOffer', 'Provider', 'Offer'),
    },
    '/v0.1/reservations': {
      servers: [{ url: 'http://127.0.0.1:4101' }],
      post: operation('prepareReservation', 'Provider', 'ProviderReservation', 'PrepareRequest'),
    },
    '/v0.1/reservations/{id}/actions': {
      servers: [{ url: 'http://127.0.0.1:4101' }],
      parameters: [ID_PARAM],
      post: operation('reservationAction', 'Provider', 'ProviderReservation', 'ProviderAction'),
    },
  },
  components: {
    securitySchemes: {
      DriverToken: {
        type: 'http',
        scheme: 'bearer',
        description: 'Development fixture maps to one driver.',
      },
      ProviderToken: {
        type: 'http',
        scheme: 'bearer',
        description: 'Private coordinator-to-provider credential.',
      },
    },
    schemas: Object.fromEntries(
      Object.entries(SCHEMAS).map(([name, schema]) => [name, z.toJSONSchema(schema)])
    ),
  },
};
await writeFile('openride-protocol/openapi.json', `${JSON.stringify(SPEC, null, 2)}\n`);
console.log('Generated openride-protocol/openapi.json');
