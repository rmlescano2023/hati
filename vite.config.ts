/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  // Vite inlines `import.meta.env.VITE_*` as literals at build time, so a
  // missing key makes every branch guarded by it statically dead — which
  // silently strips the whole signed-in app from the bundle rather than
  // failing. A production build without a key is a broken build, so say so.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), '');
    if (!env.VITE_CLERK_PUBLISHABLE_KEY) {
      throw new Error(
        'VITE_CLERK_PUBLISHABLE_KEY is not set. Run `vercel env pull .env.local` before building.',
      );
    }
  }

  return {
    plugins: [react()],
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
