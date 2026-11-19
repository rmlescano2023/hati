import { describe, expect, it } from 'vitest';
import { WHATS_NEW_VERSION, whatsNewDue } from './whatsNew';

describe('whatsNewDue', () => {
  const onboarded = '2026-11-01T00:00:00.000Z';

  it('is never due before onboarding, so a new account gets the tour instead', () => {
    expect(whatsNewDue(null, null)).toBe(false);
    expect(whatsNewDue(undefined, null)).toBe(false);
  });

  it('is due to an onboarded account that has seen nothing, or an older release', () => {
    expect(whatsNewDue(onboarded, null)).toBe(true);
    expect(whatsNewDue(onboarded, 0)).toBe(true);
  });

  it('is on release 2', () => {
    expect(WHATS_NEW_VERSION).toBe(2);
  });

  it('is not due once the current release has been seen', () => {
    expect(whatsNewDue(onboarded, 2)).toBe(false);
    expect(whatsNewDue(onboarded, 3)).toBe(false);
  });

  it('is due to an account that saw version 1 (AC-TG11.5)', () => {
    expect(whatsNewDue(onboarded, 1)).toBe(true);
  });

  it('counts an unreadable version as unseen', () => {
    expect(whatsNewDue(onboarded, '1')).toBe(true);
  });
});
