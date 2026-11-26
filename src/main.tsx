// Base styles first: CSS Modules are emitted after these, so a component's own
// rules win the specificity tie against the global element styles.
import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, SignedIn, SignedOut } from '@clerk/clerk-react';
import App from './App';
import { SessionsStoreProvider } from './context/SessionsStoreContext';
import { ProfileProvider } from './context/ProfileContext';
import { SignedOutScreen } from './components/layout/SignedOutScreen';
import { ConfigError } from './components/layout/ConfigError';
import { browserStorage, readJoinParam, stashJoin, withoutJoinParam } from './lib/joinLink';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// An invite link's token is stashed before Clerk's hash routing or a sign-in redirect can drop
// it, and taken out of the address bar so a refresh can't replay it (architect E1).
const joinRaw = readJoinParam(window.location.search);
if (joinRaw !== null) {
  stashJoin(browserStorage(), joinRaw, Date.now());
  window.history.replaceState(window.history.state, '', withoutJoinParam(window.location.href));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publishableKey ? (
      <ClerkProvider publishableKey={publishableKey}>
        <SignedIn>
          {/* The store only mounts once signed in, so it never fetches
              without a token to send. */}
          <SessionsStoreProvider>
            <ProfileProvider>
              <App />
            </ProfileProvider>
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
