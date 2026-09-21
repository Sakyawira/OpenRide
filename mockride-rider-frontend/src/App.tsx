import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OpenRideClient, OpenRideClientError } from '@sakyawira/openride-protocol/client';
import type { RideRequest, RideQuote, GeoPoint } from '@sakyawira/openride-protocol';
import {
  MapView,
  ThemeToggle,
  Notice,
  Button,
  JourneyCard,
} from '@sakyawira/mockride-design-system';

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Cannot reach the service. Try again in a moment.';
}
function money(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toFixed(2)}`;
}
function requestKey(scope: string): string {
  const name = `mockride:request:${scope}`;
  const previous = sessionStorage.getItem(name);
  if (previous) return previous;
  const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
  sessionStorage.setItem(name, key);
  return key;
}
function clearKey(scope: string): void {
  sessionStorage.removeItem(`mockride:request:${scope}`);
}

function useClient(role: 'rider' | 'driver') {
  const [settings, setSettings] = useState({
    url:
      localStorage.getItem('mockride:url') ??
      import.meta.env.VITE_OPENRIDE_URL ??
      window.location.origin,
    token: localStorage.getItem(`mockride:${role}:token`) ?? `mockride-demo-${role}`,
  });
  const api = useMemo(() => new OpenRideClient(settings.url, settings.token), [settings]);
  const connect = (url: string, token: string) => {
    localStorage.setItem('mockride:url', url);
    localStorage.setItem(`mockride:${role}:token`, token);
    setSettings({ url, token });
  };
  return { api, settings, connect };
}

function useFeed<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const running = useRef<Promise<void> | undefined>(undefined);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = generation.current;
    if (running.current) await running.current;
    if (generation.current !== current) return;
    async function update() {
      try {
        const next = await load();
        if (generation.current === current) {
          setData(next);
          setError(undefined);
        }
      } catch (failure) {
        if (generation.current === current) setError(message(failure));
      }
    }
    const operation = update();
    running.current = operation;
    try {
      await operation;
    } finally {
      if (running.current === operation) running.current = undefined;
    }
  }, [load]);
  useEffect(() => {
    generation.current++;
    setData(undefined);
    void refresh();
    const timer = window.setInterval(() => {
      if (!running.current) void refresh();
    }, 2000);
    return () => {
      generation.current++;
      window.clearInterval(timer);
    };
  }, [refresh]);
  return { data, error, refresh };
}

interface ShellProps {
  role: 'rider' | 'driver';
  children: ReactNode;
  error?: string;
  notice?: string;
  settings: { url: string; token: string };
  connect(url: string, token: string): void;
}
function Shell({ role, children, error, notice, settings, connect }: ShellProps) {
  const [connectionError, setConnectionError] = useState<string>();
  return (
    <div className="shell">
      <header>
        <a className="brand" href="/apps">
          <span className="mark">M↗</span> MOCKRIDE<span className="role">{role}</span>
        </a>
        <nav>
          <ThemeToggle />
          <a href={role === 'rider' ? '/mockride/driver/' : '/mockride/rider/'}>
            Open {role === 'rider' ? 'driver' : 'rider'} app ↗
          </a>
        </nav>
      </header>
      <details className="connection">
        <summary>Connection settings</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              const url = new URL(String(form.get('url')));
              if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
                throw new Error('Enter an HTTP or HTTPS URL.');
              connect(url.href, String(form.get('token')));
              setConnectionError(undefined);
            } catch (failure) {
              setConnectionError(message(failure));
            }
          }}
        >
          <label>
            Server URL
            <input name="url" type="url" defaultValue={settings.url} required />
          </label>
          <label>
            {role} token
            <input name="token" defaultValue={settings.token} required />
          </label>
          <Button type="submit">Connect</Button>
          {connectionError && <p role="alert">{connectionError}</p>}
        </form>
      </details>
      <main>
        <p className="eyebrow">
          <span className="dot" />
          THE OPEN NETWORK / YOUR {role.toUpperCase()} APP
        </p>
        {error && (
          <Notice warning>Offline or waking up. {error} Your saved rides stay protected.</Notice>
        )}
        {notice && <Notice>{notice}</Notice>}
        {children}
      </main>
      <footer>
        <strong>DIFFERENT APP. SAME RIDE NETWORK.</strong>
        <span>MockRide demo · Synthetic trips · No payments</span>
      </footer>
    </div>
  );
}

const STATUS: Record<RideRequest['status'], string> = {
  searching: 'FINDING A DRIVER',
  matching: 'CONFIRMING',
  confirmed: 'DRIVER CONFIRMED',
  in_progress: 'ON THE WAY',
  completed: 'ARRIVED',
  expired: 'EXPIRED',
};

export function RiderApp() {
  const client = useClient('rider');
  const [quote, setQuote] = useState<RideQuote>();
  const [pickupPoint, setPickupPoint] = useState<GeoPoint>();
  const [destinationPoint, setDestinationPoint] = useState<GeoPoint>();
  const [selecting, setSelecting] = useState<'pickup' | 'destination'>('pickup');
  const formRef = useRef<HTMLFormElement>(null);
  const incompletePins = !!pickupPoint !== !!destinationPoint;
  const quoteGeneration = useRef(0);
  useEffect(() => {
    quoteGeneration.current++;
    setQuote(undefined);
  }, [client.api]);
  const load = useCallback(() => client.api.riderSnapshot(), [client.api]);
  const { data, error, refresh } = useFeed(load);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  return (
    <Shell role="rider" {...client} error={error} notice={notice}>
      <h1>
        YOUR CITY.
        <br />
        <span>YOUR NEXT MOVE.</span>
      </h1>
      <p className="intro">Request here. Meet a driver using any app on the OpenRide network.</p>
      <div className="columns">
        <section className="request-panel">
          <p className="section-label">01 / MAKE YOUR MOVE</p>
          <form
            ref={formRef}
            onChange={() => {
              quoteGeneration.current++;
              setQuote(undefined);
            }}
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const element = event.currentTarget;
              const values = new FormData(element);
              const input = {
                pickup: String(values.get('pickup')).trim(),
                destination: String(values.get('destination')).trim(),
                providerId: String(values.get('provider')),
                ...(pickupPoint && destinationPoint
                  ? { locations: { pickup: pickupPoint, destination: destinationPoint } }
                  : {}),
              };
              const scope = `ride:${client.api.baseUrl}:${JSON.stringify(input)}`;
              setBusy(true);
              setNotice(undefined);
              const generation = quoteGeneration.current;
              try {
                if (!quote) {
                  const next = await client.api.quote(input);
                  if (generation === quoteGeneration.current) setQuote(next);
                  return;
                }
                await client.api.requestRide(
                  { ...input, expectedPrice: quote.price },
                  requestKey(scope)
                );
                setQuote(undefined);
                setPickupPoint(undefined);
                setDestinationPoint(undefined);
                clearKey(scope);
                element.reset();
                setNotice('Request sent. Drivers in OpenRide and MockRide can see it.');
              } catch (failure) {
                if (failure instanceof OpenRideClientError && failure.code === 'PRICE_CHANGED')
                  setQuote(undefined);
                setNotice(`${message(failure)} Retry the same route to check the same request.`);
              } finally {
                await refresh();
                setBusy(false);
              }
            }}
          >
            <div className="map-mode">
              <Button
                type="button"
                aria-pressed={selecting === 'pickup'}
                onClick={() => setSelecting('pickup')}
              >
                SET PICKUP
              </Button>
              <Button
                type="button"
                aria-pressed={selecting === 'destination'}
                onClick={() => setSelecting('destination')}
              >
                SET DESTINATION
              </Button>
            </div>
            <p className="map-caption">Tap the map to set your {selecting}.</p>
            <MapView
              pickup={pickupPoint}
              destination={destinationPoint}
              onSelect={
                busy
                  ? undefined
                  : (point) => {
                      quoteGeneration.current++;
                      setQuote(undefined);
                      const field = formRef.current?.elements.namedItem(selecting);
                      if (field instanceof HTMLInputElement)
                        field.value = `Map ${selecting} (${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)})`;
                      if (selecting === 'pickup') {
                        setPickupPoint(point);
                        setSelecting('destination');
                      } else setDestinationPoint(point);
                    }
              }
            />
            {(pickupPoint || destinationPoint) && (
              <Button
                className="text-button"
                type="button"
                onClick={() => {
                  setPickupPoint(undefined);
                  setDestinationPoint(undefined);
                  setQuote(undefined);
                  quoteGeneration.current++;
                }}
              >
                Clear map pins
              </Button>
            )}
            <label>
              PICKUP
              <input
                name="pickup"
                onChange={() => setPickupPoint(undefined)}
                placeholder="Where from?"
                minLength={3}
                maxLength={160}
                required
              />
            </label>
            <div className="route-arrow">↓</div>
            <label>
              DESTINATION
              <input
                name="destination"
                onChange={() => setDestinationPoint(undefined)}
                placeholder="Where to?"
                minLength={3}
                maxLength={160}
                required
              />
            </label>
            <label>
              RIDE PROVIDER
              <select name="provider" defaultValue="city">
                <option value="city">City Cooperative</option>
                <option value="harbour">Harbour Cooperative</option>
              </select>
            </label>
            <div className="fare">
              <span>{quote ? 'YOUR QUOTED FARE' : 'PROVIDER PRICING'}</span>
              <strong>
                {quote ? money(quote.price.fareMinor, quote.price.currency) : 'GET A QUOTE'}
              </strong>
            </div>
            <Button type="submit" disabled={busy || !data || !!error || incompletePins}>
              {busy ? 'PLEASE WAIT…' : quote ? 'LET’S GO ↗' : 'GET MY PRICE ↗'}
            </Button>
            <small>
              {incompletePins
                ? 'Set both pins, or clear them to enter text-only stops.'
                : 'A simulation. No payment is taken.'}
            </small>
          </form>
        </section>
        <section>
          <div className="section-heading">
            <p className="section-label">02 / YOUR JOURNEYS</p>
            <Button className="text-button" onClick={refresh}>
              Refresh ↻
            </Button>
          </div>
          {!data?.requests.length && (
            <div className="empty">
              <span>↗</span>
              <h2>Next stop: somewhere new.</h2>
              <p>Your requests and live trip progress will appear here.</p>
            </div>
          )}
          {data?.providers.some((provider) => !provider.available) && (
            <Notice warning>
              A provider is offline. Its journeys will reappear when it reconnects.
            </Notice>
          )}
          {data?.requests.map((ride) => (
            <JourneyCard
              key={ride.id}
              badge={STATUS[ride.status]}
              detail={ride.providerName}
              pickup={ride.pickup}
              destination={ride.destination}
              amount={money(ride.fareMinor, ride.currency)}
              note={
                ride.status === 'completed' ? 'Thanks for riding.' : 'Live updates every 2 seconds'
              }
            />
          ))}
        </section>
      </div>
    </Shell>
  );
}
