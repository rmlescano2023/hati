// Base styles first: CSS Modules are emitted after these, so a component's own
// rules win the specificity tie against the global element styles.
import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SessionsStoreProvider } from './context/SessionsStoreContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionsStoreProvider>
      <App />
    </SessionsStoreProvider>
  </StrictMode>,
);
