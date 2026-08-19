/** Short, collision-safe id. Uses `crypto.randomUUID` where available. */
export function createId(prefix = 'id'): string {
  const globalCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
  if (globalCrypto?.randomUUID) {
    return `${prefix}_${globalCrypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
