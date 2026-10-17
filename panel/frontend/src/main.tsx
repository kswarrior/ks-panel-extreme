import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/App';
import { initLowPowerMode } from '@/shared/utils/lowPower';
import './index.css';

// Runs before first paint so low-power devices never composite a single
// blurred frame.
initLowPowerMode();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
