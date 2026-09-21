import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DriverApp } from './App';
import { initializeMockRideTheme } from '@sakyawira/mockride-design-system';
import '@sakyawira/mockride-design-system/styles.css';

initializeMockRideTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DriverApp />
  </StrictMode>
);
