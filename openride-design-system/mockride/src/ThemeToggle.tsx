import { useEffect, useState } from 'react';

type Appearance = 'system' | 'light' | 'dark';
const APPEARANCE_KEY = 'mockride:appearance';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function savedAppearance(): Appearance {
  try {
    const value = localStorage.getItem(APPEARANCE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    /* A restricted browser can still switch themes for this session. */
  }
  return 'system';
}

function applyAppearance(value: Appearance): void {
  document.documentElement.dataset.theme =
    value === 'system' ? (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light') : value;
}

/** Apply the saved/device theme before mounting the application. */
export function initializeMockRideTheme(): void {
  applyAppearance(savedAppearance());
}

export function ThemeToggle() {
  const [appearance, setAppearance] = useState<Appearance>(savedAppearance);
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const update = () => applyAppearance(appearance);
    const sync = (event: StorageEvent) => {
      if (event.key === APPEARANCE_KEY || event.key === null) setAppearance(savedAppearance());
    };
    update();
    media.addEventListener('change', update);
    window.addEventListener('storage', sync);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('storage', sync);
    };
  }, [appearance]);
  return (
    <label className="theme-control">
      Appearance
      <select
        value={appearance}
        onChange={(event) => {
          const value = event.target.value;
          if (value !== 'system' && value !== 'light' && value !== 'dark') return;
          setAppearance(value);
          try {
            localStorage.setItem(APPEARANCE_KEY, value);
          } catch {
            /* Session choice still applies. */
          }
        }}
      >
        <option value="system">Device theme</option>
        <option value="light">Light mode</option>
        <option value="dark">Dark mode</option>
      </select>
    </label>
  );
}
