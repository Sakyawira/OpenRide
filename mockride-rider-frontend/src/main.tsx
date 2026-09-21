import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RiderApp } from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RiderApp />
  </StrictMode>
);
