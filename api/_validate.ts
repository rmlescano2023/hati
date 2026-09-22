import { parseSession } from '../src/lib/storage.js';
import type { Session } from '../src/types';

/**
 * The validation boundary for a write.
 *
 * `parseAppData` used to hold this role over an entire account document; now
 * that a write names one session, validation is scoped to that session. It is
 * the same parser the browser uses, so a body that survives here is a body the
 * app can load.
 *
 * The id comes from the path rather than the body, so a client cannot write to
 * one session while claiming to be another.
 */
export function parseSessionInput(id: string, raw: unknown): Session | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const session = parseSession({ ...(raw as Record<string, unknown>), id });
  return session;
}
