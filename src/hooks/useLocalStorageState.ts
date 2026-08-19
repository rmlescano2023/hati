import { useCallback, useEffect, useRef, useState } from 'react';

type Options<T> = {
  /** Turn the stored string into state. Must never throw. */
  deserialize: (raw: string | null) => T;
  serialize: (value: T) => string;
};

/**
 * `useState` that mirrors itself into `localStorage` under `key`.
 * Reads once on mount (lazy initialiser) and writes on every change.
 * Storage failures (private mode, quota) are non-fatal: the app keeps working
 * in memory for the session.
 */
export function useLocalStorageState<T>(
  key: string,
  { deserialize, serialize }: Options<T>,
): [T, (updater: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return deserialize(window.localStorage.getItem(key));
    } catch {
      return deserialize(null);
    }
  });

  // Skip the very first write so mounting never rewrites untouched storage.
  const hydrated = useRef(false);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      window.localStorage.setItem(key, serialize(value));
    } catch {
      // Storage unavailable — keep going with in-memory state only.
    }
  }, [key, serialize, value]);

  const update = useCallback((updater: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater));
  }, []);

  return [value, update];
}
