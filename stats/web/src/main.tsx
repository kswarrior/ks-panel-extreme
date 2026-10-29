import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { OverviewProvider } from './context/OverviewContext';
import { PanelsProvider } from './context/PanelsContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OverviewProvider>
          <PanelsProvider>
            <App />
          </PanelsProvider>
        </OverviewProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
