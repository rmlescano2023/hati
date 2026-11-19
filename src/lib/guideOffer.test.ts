import { describe, expect, it } from 'vitest';
import { guideOfferDue, type OfferContext } from './guideOffer';

// Row 8 of the state table: the first Expenses visit with nothing else going on.
const base: OfferContext = {
  tab: 'expenses',
  seen: { expenses: false, collection: false },
  prompted: false,
  dialogOpen: false,
  unsaved: false,
  collectionClear: false,
};

describe('guideOfferDue (BR-TG8, BR-TG9)', () => {
  it('1: offers nothing off the two tabs (Home, History, practice, Breakdown, Summary)', () => {
    expect(guideOfferDue({ ...base, tab: null })).toBeNull();
    expect(guideOfferDue({ ...base, tab: null, collectionClear: true })).toBeNull();
  });

  it('2: offers nothing until the account is read, or after a failed read (AC-TG9.8)', () => {
    expect(guideOfferDue({ ...base, seen: null })).toBeNull();
    expect(
      guideOfferDue({ ...base, tab: 'collection', collectionClear: true, seen: null }),
    ).toBeNull();
  });

  it('3: offers nothing on Expenses once that guide was started or declined', () => {
    expect(guideOfferDue({ ...base, seen: { expenses: true, collection: false } })).toBeNull();
    expect(guideOfferDue({ ...base, seen: { expenses: true, collection: true } })).toBeNull();
  });

  it('4: offers nothing on Collection once that guide was started or declined', () => {
    expect(
      guideOfferDue({
        ...base,
        tab: 'collection',
        collectionClear: true,
        seen: { expenses: false, collection: true },
      }),
    ).toBeNull();
  });

  it('5: offers nothing once another prompt showed on this visit', () => {
    expect(guideOfferDue({ ...base, prompted: true })).toBeNull();
    expect(
      guideOfferDue({ ...base, tab: 'collection', collectionClear: true, prompted: true }),
    ).toBeNull();
  });

  it('6: offers nothing while a dialog is open', () => {
    expect(guideOfferDue({ ...base, dialogOpen: true })).toBeNull();
    expect(
      guideOfferDue({ ...base, tab: 'collection', collectionClear: true, dialogOpen: true }),
    ).toBeNull();
  });

  it("7: offers nothing on Expenses with unsaved work, as after Breakdown's Edit (AC-TG9.5)", () => {
    expect(guideOfferDue({ ...base, unsaved: true })).toBeNull();
  });

  it('8: offers the Expenses guide on a first clear Expenses visit (AC-TG9.1)', () => {
    expect(guideOfferDue(base)).toBe('expenses');
  });

  it('9: offers nothing on Collection until "Already settled?" is out of the way', () => {
    expect(guideOfferDue({ ...base, tab: 'collection', collectionClear: false })).toBeNull();
  });

  it('10: offers the Collection guide on a first clear Collection visit (AC-TG10.1, AC-TG10.5)', () => {
    expect(guideOfferDue({ ...base, tab: 'collection', collectionClear: true })).toBe('collection');
    // Unsaved Expenses work is no reason to hold the Collection offer back.
    expect(
      guideOfferDue({ ...base, tab: 'collection', collectionClear: true, unsaved: true }),
    ).toBe('collection');
  });

  it("keeps each guide's flag to itself (AC-TG12.4)", () => {
    expect(
      guideOfferDue({
        ...base,
        tab: 'collection',
        collectionClear: true,
        seen: { expenses: true, collection: false },
      }),
    ).toBe('collection');
    expect(guideOfferDue({ ...base, seen: { expenses: false, collection: true } })).toBe(
      'expenses',
    );
  });
});
