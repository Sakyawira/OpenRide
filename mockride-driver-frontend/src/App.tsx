import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OpenRideClient } from '@sakyawira/openride-protocol/client';
import type { Booking, Offer, TripAction } from '@sakyawira/openride-protocol';
import { MapView } from './MapView';

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
          <button>Connect</button>
          {connectionError && <p role="alert">{connectionError}</p>}
        </form>
      </details>
      <main>
        <p className="eyebrow">
          <span className="dot" />
          THE OPEN NETWORK / YOUR {role.toUpperCase()} APP
        </p>
        {error && (
          <p className="notice error" role="alert">
            Offline or waking up. {error} Your saved rides stay protected.
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {children}
      </main>
      <footer>
        <strong>DIFFERENT APP. SAME RIDE NETWORK.</strong>
        <span>MockRide demo · Synthetic trips · No payments</span>
      </footer>
    </div>
  );
}

export function DriverApp() {
  const client = useClient('driver');
  const load = useCallback(() => client.api.driverSnapshot(), [client.api]);
  const { data, error, refresh } = useFeed(load);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const booking = data?.activeBooking;
  async function command(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice(undefined);
    try {
      await operation();
    } catch (failure) {
      setNotice(message(failure));
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function accept(offer: Offer) {
    await command(async () => {
      const scope = `accept:${client.api.baseUrl}:${offer.id}`;
      const accepted = await client.api.accept(offer, requestKey(scope));
      if (['cancelled', 'completed', 'rejected'].includes(accepted.state)) {
        clearKey(scope);
        setNotice(
          'That earlier request has ended. Choose an available ride to start a new booking.'
        );
      }
    });
  }
  async function action(value: Booking, tripAction: TripAction) {
    await command(async () => {
      const result = await client.api.action(value.id, tripAction);
      if (['cancelled', 'completed'].includes(result.state))
        clearKey(`accept:${client.api.baseUrl}:${value.offer.id}`);
      setNotice(
        result.state === 'completed'
          ? 'Trip complete. Ready for your next move.'
          : result.state === 'cancelled'
            ? 'Ride cancelled. You are available again.'
            : undefined
      );
    });
  }
  return (
    <Shell role="driver" {...client} error={error} notice={notice}>
      <h1>
        MORE CHOICE.
        <br />
        <span>ONE DRIVER.</span>
      </h1>
      <p className="intro">
        Pick a ride from the network. Riders can be using OpenRide or MockRide.
      </p>
      <div className="columns driver-columns">
        <section>
          <div className="section-heading">
            <p className="section-label">01 / AVAILABLE RIDES</p>
            <button className="text-button" onClick={refresh}>
              Refresh ↻
            </button>
          </div>
          {data?.providers.some((provider) => !provider.available) && (
            <p className="notice error">
              One provider is offline. Your current booking remains protected.
            </p>
          )}
          {!data?.offers.length && (
            <div className="empty">
              <h2>Waiting for the next move.</h2>
              <p>Request a ride in either rider app and it will appear here.</p>
            </div>
          )}
          {data?.offers.map((offer) => (
            <article className="journey" key={offer.id}>
              <div className="card-top">
                <span className="badge">{offer.providerName}</span>
                <span>{offer.pickupMinutes} min to pickup</span>
              </div>
              <h2>
                {offer.pickup}
                <span className="to">↓</span>
                {offer.destination}
              </h2>
              <div className="card-bottom">
                <strong>{money(offer.payoutMinor, offer.currency)}</strong>
                <span>
                  {offer.distanceKm} km · {offer.tripMinutes} min
                </span>
              </div>
              <button
                disabled={busy || !!booking || !!error || Date.parse(offer.expiresAt) <= Date.now()}
                onClick={() => accept(offer)}
              >
                ACCEPT RIDE ↗
              </button>
            </article>
          ))}
        </section>
        <aside className="trip-panel">
          <p className="section-label">02 / YOUR AVAILABILITY</p>
          {booking ? (
            <>
              <span className="badge">{booking.state.replaceAll('_', ' ').toUpperCase()}</span>
              <h2>
                {booking.offer.pickup}
                <span className="to">↓</span>
                {booking.offer.destination}
              </h2>
              <p>{booking.offer.providerName}</p>
              <strong className="trip-fare">
                {money(booking.offer.payoutMinor, booking.offer.currency)}
              </strong>
              {booking.state === 'confirmed' && (
                <>
                  <button disabled={busy || !!error} onClick={() => action(booking, 'start')}>
                    START TRIP ↗
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || !!error}
                    onClick={() => action(booking, 'cancel')}
                  >
                    Cancel ride
                  </button>
                </>
              )}
              {booking.state === 'in_progress' && (
                <button disabled={busy || !!error} onClick={() => action(booking, 'complete')}>
                  COMPLETE TRIP ✓
                </button>
              )}
              {['preparing', 'resolving'].includes(booking.state) && (
                <>
                  <p>Your reservation stays protected while the provider confirms.</p>
                  <button
                    disabled={busy || !!error}
                    onClick={() =>
                      command(async () => {
                        await client.api.reconcile(booking.id);
                      })
                    }
                  >
                    CHECK STATUS ↻
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <div className="available-symbol">↗</div>
              <h2>
                YOU’RE
                <br />
                GOOD TO GO.
              </h2>
              <p>
                Choose a ride. Accepting it reserves your availability across this demo network.
              </p>
            </>
          )}
          <MapView
            pickup={booking?.offer.locations?.pickup}
            destination={booking?.offer.locations?.destination}
          />
          {!booking?.offer.locations && (
            <p className="map-caption">Pins appear for rides selected on the map.</p>
          )}
          <p className="trip-note">ONE DRIVER. ONE ACTIVE TRIP.</p>
        </aside>
      </div>
    </Shell>
  );
}
