/// <reference types="vite/client" />

// Merges with Vite's own ImportMetaEnv, so DEV/PROD and friends stay declared.
interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}
