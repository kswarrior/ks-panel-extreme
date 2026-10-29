import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { PanelsProvider } from './context/PanelsContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PanelsProvider>
        <App />
      </PanelsProvider>
    </BrowserRouter>
  </StrictMode>
);
