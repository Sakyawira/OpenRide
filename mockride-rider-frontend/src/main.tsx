import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RiderApp } from './App';
import { initializeMockRideTheme } from '@sakyawira/mockride-design-system';
import '@sakyawira/mockride-design-system/styles.css';

initializeMockRideTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RiderApp />
  </StrictMode>
);
