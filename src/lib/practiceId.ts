/** Every practice session's id starts with this, and the server refuses to store one (BR-TG3). */
export const PRACTICE_ID_PREFIX = 'practice_';

export function isPracticeId(id: string): boolean {
  return id.startsWith(PRACTICE_ID_PREFIX);
}
