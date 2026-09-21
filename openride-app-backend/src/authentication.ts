import { timingSafeEqual } from 'node:crypto';
import { ProtocolError } from '@sakyawira/openride-protocol';
import type { DriverAuthenticator } from './ports';

/** Development adapter only; replace with verified identity in production. */
export class StaticBearerAuthenticator implements DriverAuthenticator {
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
