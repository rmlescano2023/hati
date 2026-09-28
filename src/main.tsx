// Base styles first: CSS Modules are emitted after these, so a component's own
// rules win the specificity tie against the global element styles.
import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, SignedIn, SignedOut } from '@clerk/clerk-react';
import App from './App';
import { SessionsStoreProvider } from './context/SessionsStoreContext';
import { SignedOutScreen } from './components/layout/SignedOutScreen';
import { ConfigError } from './components/layout/ConfigError';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publishableKey ? (
      <ClerkProvider publishableKey={publishableKey}>
        <SignedIn>
          {/* The store only mounts once signed in, so it never fetches
              without a token to send. */}
          <SessionsStoreProvider>
            <App />
          </SessionsStoreProvider>
        </SignedIn>
        <SignedOut>
          <SignedOutScreen />
        </SignedOut>
      </ClerkProvider>
    ) : (
      <ConfigError />
    )}
  </StrictMode>,
);
