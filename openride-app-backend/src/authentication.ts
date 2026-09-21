import { timingSafeEqual } from 'node:crypto';
import { ProtocolError } from '@sakyawira/openride-protocol';
import type { ParticipantAuthenticator } from './ports';

/** Development adapter only; replace with verified identity in production. */
export class StaticBearerAuthenticator implements ParticipantAuthenticator {
  constructor(
    private readonly token: string,
    private readonly identity: string
  ) {}

  async authenticate(authorization: string | undefined): Promise<string> {
    const actual = Buffer.from(authorization ?? '');
    const expected = Buffer.from(`Bearer ${this.token}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new ProtocolError('UNAUTHORIZED', 'A valid access token is required.', 401);
    }
    return this.identity;
  }
}

/** Distinct public demo identities for independent client implementations. */
export class FixtureTokenAuthenticator implements ParticipantAuthenticator {
  constructor(private readonly identities: Readonly<Record<string, string>>) {}

  async authenticate(authorization: string | undefined): Promise<string> {
    const actual = Buffer.from(authorization ?? '');
    for (const [token, identity] of Object.entries(this.identities)) {
      const expected = Buffer.from(`Bearer ${token}`);
      if (actual.length === expected.length && timingSafeEqual(actual, expected)) return identity;
    }
    throw new ProtocolError('UNAUTHORIZED', 'A valid token for this role is required.', 401);
  }
}
