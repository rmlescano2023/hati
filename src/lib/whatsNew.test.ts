import { describe, expect, it } from 'vitest';
import { WHATS_NEW_NOTES, WHATS_NEW_VERSION, whatsNewDue, whatsNewNotes } from './whatsNew';

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

  it('is on release 3', () => {
    expect(WHATS_NEW_VERSION).toBe(3);
  });

  it('is not due once the current release has been seen', () => {
    expect(whatsNewDue(onboarded, 3)).toBe(false);
    expect(whatsNewDue(onboarded, 4)).toBe(false);
  });

  it('is due to an account that saw version 2', () => {
    expect(whatsNewDue(onboarded, 2)).toBe(true);
  });

  it('is due to an account that saw version 1 (AC-TG11.5)', () => {
    expect(whatsNewDue(onboarded, 1)).toBe(true);
  });

  it('counts an unreadable version as unseen', () => {
    expect(whatsNewDue(onboarded, '1')).toBe(true);
  });
});

describe('WHATS_NEW_NOTES', () => {
  it('ends at the release the app is on, so a bump without notes is caught', () => {
    expect(WHATS_NEW_VERSION).toBe(Math.max(...WHATS_NEW_NOTES.map((n) => n.version)));
  });

  it('keeps each release as it shipped, newest release first (BR-WC3, OQ-3)', () => {
    expect(WHATS_NEW_NOTES).toEqual([
      {
        version: 3,
        title: 'Joined sessions.',
        body: 'On a finished session, tap Share with members and share the link. Each person signs in, picks who they are, and follows what they owe or are owed in their own Collection.',
      },
      {
        version: 3,
        title: "“I've paid.”",
        body: "Members who joined can tell you they've paid. It waits until you confirm or decline it, so you both end up with the same figures.",
      },
      {
        version: 3,
        title: 'Collection and History.',
        body: "Collection now shows only what's still being paid; settled sessions are in History.",
      },
      {
        version: 2,
        title: 'Receipts, item by item.',
        body: "In Custom Amounts, type a receipt the way it's printed: what each person had, dishes people shared, discounts like PWD or senior, and service charges. Hati works out each person's share.",
      },
      {
        version: 2,
        title: 'Guides.',
        body: 'Tap “Need help?” on Expenses or Collection for a quick practice run, or open Tutorials in your account menu.',
        showMeHow: true,
      },
      {
        version: 1,
        title: 'Collection.',
        body: 'A new tab for finished sessions: see who owes you and who you owe, and record payments as they come in, even part payments.',
      },
      {
        version: 1,
        title: 'Your name.',
        body: 'Set it in Profile, in your account menu, so Hati knows which member is you.',
      },
    ]);
  });
});

describe('whatsNewNotes', () => {
  const titles = (notes: { title: string }[]) => notes.map((n) => n.title);
  const latest = ['Joined sessions.', "“I've paid.”", 'Collection and History.'];
  const earlierAll = ['Receipts, item by item.', 'Guides.', 'Collection.', 'Your name.'];

  it.each([null, 0])('gives everything to an account that has seen %s (AC-WC1.1)', (seen) => {
    const r = whatsNewNotes(seen);
    expect(titles(r.latest)).toEqual(latest);
    expect(titles(r.earlier)).toEqual(earlierAll);
    expect(r.showMeHow).toBe(true);
  });

  it('gives release 1 an account that saw 1 only the notes after it (AC-WC1.2)', () => {
    const r = whatsNewNotes(1);
    expect(titles(r.latest)).toEqual(latest);
    expect(titles(r.earlier)).toEqual(['Receipts, item by item.', 'Guides.']);
    expect(r.showMeHow).toBe(true);
  });

  it('gives an account that saw 2 only the current notes, and no guide button (AC-WC1.3)', () => {
    const r = whatsNewNotes(2);
    expect(titles(r.latest)).toEqual(latest);
    expect(r.earlier).toEqual([]);
    expect(r.showMeHow).toBe(false);
  });

  it.each([3, 4])('gives nothing to an account that saw %s (AC-WC1.4)', (seen) => {
    expect(whatsNewNotes(seen)).toEqual({ latest: [], earlier: [], showMeHow: false });
  });

  it.each(['1', undefined, {}])('reads %j as unseen (AC-WC1.5)', (seen) => {
    expect(whatsNewNotes(seen)).toEqual(whatsNewNotes(0));
  });

  it.each([null, 0, 1, 2, 3, 4, '1'])(
    'lists a note exactly when whatsNewDue says it is due, for seen %j (BR-WC2)',
    (seen) => {
      const r = whatsNewNotes(seen);
      expect(whatsNewDue('2026-11-01T00:00:00.000Z', seen)).toBe(
        r.latest.length + r.earlier.length > 0,
      );
    },
  );

  describe('with a later release (AC-WC4.1)', () => {
    const v4 = [
      { version: 4, title: 'Four A.', body: 'a' },
      { version: 4, title: 'Four B.', body: 'b' },
    ];

    it('puts the new notes under Latest and the old current ones under Earlier', () => {
      const r = whatsNewNotes(2, [...v4, ...WHATS_NEW_NOTES], 4);
      expect(titles(r.latest)).toEqual(['Four A.', 'Four B.']);
      expect(titles(r.earlier)).toEqual(latest);
    });

    it('shows only the new notes to an account that saw 3', () => {
      const r = whatsNewNotes(3, [...v4, ...WHATS_NEW_NOTES], 4);
      expect(titles(r.latest)).toEqual(['Four A.', 'Four B.']);
      expect(r.earlier).toEqual([]);
    });
  });

  it('never shows a note written ahead of the release bump (BR-WC1)', () => {
    const ahead = [{ version: 4, title: 'Four A.', body: 'a' }, ...WHATS_NEW_NOTES];
    const r = whatsNewNotes(2, ahead);
    expect(titles(r.latest)).toEqual(latest);
    expect(r.earlier).toEqual([]);
  });
});
