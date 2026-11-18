import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EXPENSES_STEPS } from './expensesSteps';
import { expensesScenes, type ExpensesSceneId } from './expensesScenes';
import { COLLECTION_STEPS } from './collectionSteps';
import { PRACTICE_BEACH_ID, collectionScenes, type CollectionSceneId } from './collectionScenes';
import { PracticeScene } from './PracticeExpenses';
import { PracticeCollectionScene } from './PracticeCollection';
import { parsePaymentsInput } from '../../../../api/_validate';
import { PracticeProfileProvider, useProfile } from '../../../context/ProfileContext';
import { billAmounts, billMatches, billMembers } from '../../../lib/bill';
import { getItemTotal } from '../../../lib/calculations';
import { buildCard, buildCollection, isFullyPaid } from '../../../lib/collection';
import { addPaymentsTo, removePaymentFrom, settleOne } from '../../../lib/memorySessions';
import { sumMoney } from '../../../lib/money';
import {
  billDraftFromItem,
  fillRemainder,
  linesFromItem,
  readBillDraft,
} from '../../../lib/orderLines';
import { isPracticeId } from '../../../lib/practiceId';
import { buildRecords, contributionsMatch, type StagedItem } from '../../../lib/staging';
import { parseSession } from '../../../lib/storage';
import type { CustomAmountItem } from '../../../types';

const TODAY = '2026-11-16';
const noop = () => {};
const scenes = expensesScenes(TODAY);
const sceneIds = Object.keys(scenes) as ExpensesSceneId[];

/** Every staged-shaped row a scene loads: its form's row and its staged list. */
const rowsOf = (id: ExpensesSceneId): StagedItem[] => [
  ...(scenes[id].form ? [scenes[id].form.row] : []),
  ...scenes[id].staged,
];

describe('the Expenses guide steps', () => {
  it('has the 18 steps in the approved order (AC-TG2.1)', () => {
    expect(EXPENSES_STEPS).toHaveLength(18);
    expect(EXPENSES_STEPS.map((s) => s.target).join(', ')).toBe(
      'group-members, purchase-date, paid-by, paid-by, item-name, equal-owners, item-mode, custom-total, who-in-item, sub-items, bill-shared, bill-discounts, bill-charges, custom-figures, custom-total, add-item, staged-list, save-to-breakdown',
    );
    expect(EXPENSES_STEPS.map((s) => s.place)).toEqual([
      ...Array(3).fill('X1'),
      ...Array(3).fill('X2'),
      ...Array(10).fill('X3'),
      ...Array(2).fill('X4'),
    ]);
  });

  it('gives every step a plain target and real copy', () => {
    for (const step of EXPENSES_STEPS) {
      expect(step.target).toMatch(/^[a-z-]+$/);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.content.length).toBeGreaterThan(20);
    }
  });

  it('names a scene that exists on every step', () => {
    for (const step of EXPENSES_STEPS) expect(sceneIds).toContain(step.place);
  });
});

describe('the scene seeds (BR-TG17)', () => {
  it.each(['X1', 'X2', 'X3', 'X4'] as const)('%s survives buildRecords and parseSession', (id) => {
    const records = buildRecords(rowsOf(id)).map((r, i) => ({
      ...r,
      id: `r${i}`,
      createdAt: '2026-01-01T00:00:00.000Z',
    }));
    const input = { ...scenes[id].session, records };
    expect(parseSession(input)).toEqual(input);
  });

  it('keeps every Custom item consistent with its bill', () => {
    for (const id of sceneIds) {
      for (const { item } of rowsOf(id)) {
        if (item.mode !== 'custom' || !item.bill) continue;
        expect(billMatches(item.bill, item.amounts)).toBe(true);
        expect(item.amounts).toEqual(billAmounts(item.bill, billMembers(item.bill)));
      }
    }
  });

  it('keeps every Multiple Payors row paying exactly what the item costs', () => {
    for (const id of sceneIds) {
      for (const row of rowsOf(id)) {
        if (row.payorMode === 'multiple') {
          expect(contributionsMatch(row.payors, getItemTotal(row.item))).toBe(true);
        }
      }
    }
  });

  it('gives every scene a practice id', () => {
    for (const id of sceneIds) expect(isPracticeId(scenes[id].session.id)).toBe(true);
  });
});

describe('scene X3 (AC-TG2.2, AC-TG2.5)', () => {
  const dinner = scenes.X3.form!.row.item as CustomAmountItem;
  const members = scenes.X3.session.members;
  const lines = linesFromItem(dinner, members);
  const bill = billDraftFromItem(dinner, members);

  it('reads the receipt figures the guide quotes', () => {
    const view = readBillDraft(members, lines, bill);
    expect(view.subtotal).toBe(690);
    expect(view.discounts).toBe(30);
    expect(view.charges).toBe(80);
    expect(view.entered).toBe(740);
    expect(view.shares).toEqual({ Ana: 250, Ben: 230, Carla: 220, Dino: 40 });
  });

  it('fills Dino with 120.00, which brings Entered to 860 and his share to 160', () => {
    const { others } = readBillDraft(members, lines, bill);
    const filled = fillRemainder(860, members, lines, others);
    expect(filled.Dino[0].price).toBe('120.00');
    const after = readBillDraft(members, filled, bill);
    expect(after.entered).toBe(860);
    expect(after.shares.Dino).toBe(160);
  });
});

describe('scene X4', () => {
  it('stages two items worth 2,060', () => {
    expect(sumMoney(scenes.X4.staged.map((s) => getItemTotal(s.item)))).toBe(2060);
  });
});

describe('each scene shows its targets (AC-TG2.2, BR-TG14)', () => {
  const html = (id: ExpensesSceneId) =>
    renderToStaticMarkup(
      createElement(PracticeScene, {
        scene: scenes[id],
        onBackToHome: noop,
        onMembersIntact: noop,
      }),
    ).replace(/&#x27;/g, "'");

  const count = (text: string, part: string) => text.split(part).length - 1;

  it.each(sceneIds)('%s has each of its step targets exactly once', (id) => {
    const markup = html(id);
    for (const step of EXPENSES_STEPS.filter((s) => s.place === id)) {
      // Bill targets carry their section in the attribute, e.g. bill-shared.
      expect(count(markup, `data-tour="${step.target}"`), step.target).toBe(1);
    }
  });

  it("shows Ben's two sub-items under the sub-items target in X3", () => {
    const markup = html('X3');
    const from = markup.indexOf('data-tour="sub-items"');
    const to = markup.indexOf('Add sub-item for Ben');
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const block = markup.slice(from, to);
    for (const part of [
      'value="Chicken inasal"',
      'value="120.00"',
      'value="Iced tea"',
      'value="40.00"',
    ]) {
      expect(block).toContain(part);
    }
  });

  it('shows the two payors in X2', () => {
    const markup = html('X2');
    expect(markup).toMatch(
      /id="contrib-Ana"[^>]*value="700.00"|value="700.00"[^>]*id="contrib-Ana"/,
    );
  });

  it('shows the staged count in X4', () => {
    expect(html('X4')).toContain('2 items staged');
  });
});

describe('the first step of each guide', () => {
  it('goes straight to the point, with no practice preamble (owner, 2026-11-18)', () => {
    expect(EXPENSES_STEPS[0].content).toMatch(/^Start by adding everyone/);
    expect(COLLECTION_STEPS[0].content).toMatch(/^Collection tracks money/);
    for (const step of [...EXPENSES_STEPS, ...COLLECTION_STEPS]) {
      expect(step.content).not.toContain('nothing here is saved');
    }
  });
});

describe('the Collection guide steps (AC-TG7.2)', () => {
  const kScenes = collectionScenes(new Date(2026, 10, 17, 9, 0));
  const kIds = Object.keys(kScenes) as CollectionSceneId[];

  it('has the 7 steps in the approved order', () => {
    expect(COLLECTION_STEPS).toHaveLength(7);
    expect(COLLECTION_STEPS.map((s) => s.target).join(', ')).toBe(
      'collection-totals, collection-unsettled, collection-outstanding, collection-owed, collection-owed, collection-mark-all, collection-settled',
    );
    expect(COLLECTION_STEPS.map((s) => s.place)).toEqual([
      ...Array(3).fill('K1'),
      ...Array(3).fill('K2'),
      'K3',
    ]);
  });

  it('gives every step a plain target and real copy', () => {
    for (const step of COLLECTION_STEPS) {
      expect(step.target).toMatch(/^[a-z-]+$/);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.content.length).toBeGreaterThan(20);
    }
  });

  it('names a scene that exists on every step', () => {
    for (const step of COLLECTION_STEPS) expect(kIds).toContain(step.place);
  });
});

describe('the Collection scene seeds (BR-TG17)', () => {
  const NOW = new Date(2026, 10, 17, 9, 0);
  const kScenes = collectionScenes(NOW);
  const kIds = Object.keys(kScenes) as CollectionSceneId[];
  const { K1, K2, K3 } = kScenes;
  const names = { displayName: 'Ana', nicknames: [] };
  const beach = (scene: typeof K1) => scene.sessions.find((x) => x.id === PRACTICE_BEACH_ID)!;
  const day = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const daysBefore = (iso: string) => Math.round((day(NOW.toISOString()) - day(iso)) / 86_400_000);

  it('passes the validators, session by session', () => {
    for (const id of kIds) {
      for (const session of kScenes[id].sessions) {
        expect(parseSession(session)).toEqual({ ...session, payments: [] });
        for (const p of session.payments) {
          const { debtor, creditor, amountCents } = p;
          expect(
            parsePaymentsInput({
              sessionId: session.id,
              payments: [{ id: p.id, debtor, creditor, amountCents }],
            }),
            p.id,
          ).not.toBeNull();
        }
        expect(isPracticeId(session.id)).toBe(true);
        expect(session.status).toBe('closed');
        expect(session.finishedWithCollection).toBe(true);
      }
    }
  });

  it('dates everything relative to now (BR-TG16)', () => {
    const [beachTrip, movie, karaoke] = [
      beach(K1),
      K1.sessions.find((x) => x.id === 'practice_movie')!,
      K1.sessions.find((x) => x.id === 'practice_karaoke')!,
    ];
    expect(daysBefore(beachTrip.closedAt!)).toBe(3);
    expect(daysBefore(beachTrip.payments[0].createdAt)).toBe(2);
    expect(daysBefore(movie.closedAt!)).toBe(10);
    expect(daysBefore(karaoke.closedAt!)).toBe(21);
    expect(daysBefore(karaoke.payments[0].createdAt)).toBe(14);
  });

  it('K1 shows the figures the guide quotes (AC-TG7.1)', () => {
    const c = buildCollection(K1.sessions, names);
    expect(c.needsSetup.map((x) => x.session.id)).toEqual(['practice_movie']);
    expect(c.outstanding.map((x) => x.session.id)).toEqual([PRACTICE_BEACH_ID]);
    expect(c.settled.map((x) => x.session.id)).toEqual(['practice_karaoke']);
    expect(c.owedToYouCents).toBe(148000);
    expect(c.youOweCents).toBe(15000);
    const card = c.outstanding[0];
    const line = (lines: typeof card.owedToYou, other: string) =>
      lines.find((l) => l.other === other)!;
    expect(line(card.owedToYou, 'Ben')).toMatchObject({
      amountCents: 125000,
      paidCents: 0,
      status: 'unpaid',
    });
    expect(line(card.owedToYou, 'Carla')).toMatchObject({
      amountCents: 43000,
      paidCents: 20000,
      status: 'partial',
    });
    expect(line(card.youOwe, 'Dino')).toMatchObject({ amountCents: 15000, status: 'unpaid' });
    expect(c.alreadySettledOffers).toEqual([]);
  });

  it('opens K2 on Beach trip and K1 and K3 on nothing', () => {
    expect(K2.openSessionId).toBe(PRACTICE_BEACH_ID);
    expect(K1.openSessionId).toBeUndefined();
    expect(K3.openSessionId).toBeUndefined();
  });

  it("gives the reader's actions the outcomes the guide describes (AC-TG7.3 to AC-TG7.6)", () => {
    const NOW_ISO = NOW.toISOString();
    // C2: Anna is picked, which is what the store's setMe writes.
    const movie = K1.sessions.find((x) => x.id === 'practice_movie')!;
    const placed = buildCard({ ...movie, me: 'Anna' }, names);
    expect(placed.bucket).toBe('outstanding');
    expect(placed.youOwe).toHaveLength(1);
    expect(placed.youOwe[0]).toMatchObject({ other: 'Ben', amountCents: 50000 });

    // C4: Ben pays 500.00 of 1,250.00.
    const afterBen = addPaymentsTo(
      K2.sessions,
      PRACTICE_BEACH_ID,
      [{ id: 'pay_ben', debtor: 'Ben', creditor: 'Ana', amountCents: 50000 }],
      NOW_ISO,
    );
    const ben = buildCard(beach({ ...K2, sessions: afterBen }), names).owedToYou.find(
      (l) => l.other === 'Ben',
    )!;
    expect(ben).toMatchObject({ paidCents: 50000, remainingCents: 75000, status: 'partial' });

    // C5: Carla's 200.00 is undone.
    const afterUndo = removePaymentFrom(K2.sessions, PRACTICE_BEACH_ID, 'pay_practiceCarla');
    const undone = buildCard(beach({ ...K2, sessions: afterUndo }), names);
    expect(undone.owedToYou.find((l) => l.other === 'Carla')!.status).toBe('unpaid');
    expect(undone.bucket).toBe('outstanding');

    // C6: Mark all, which is what scene K3 seeds.
    let n = 0;
    const settled = settleOne(K2.sessions, PRACTICE_BEACH_ID, () => `pay_t${n++}`, NOW_ISO);
    const after = settled.find((x) => x.id === PRACTICE_BEACH_ID)!;
    expect(isFullyPaid(after)).toBe(true);
    expect(buildCard(after, names).bucket).toBe('settled');
    expect(isFullyPaid(beach(K3))).toBe(true);
    const k3 = buildCollection(K3.sessions, names);
    expect(k3.outstanding).toEqual([]);
    expect(k3.settled).toHaveLength(2);
    expect(k3.needsSetup).toHaveLength(1);
    // The same payments, whatever their ids: three more on top of Carla's 200.00.
    const amounts = (x: typeof after) =>
      x.payments.map((p) => `${p.debtor}>${p.creditor}:${p.amountCents}`).sort();
    expect(amounts(beach(K3))).toEqual(amounts(after));
  });
});

describe('each Collection scene shows its targets (AC-TG7.1, BR-TG14)', () => {
  const kScenes = collectionScenes(new Date(2026, 10, 17, 9, 0));
  const kIds = Object.keys(kScenes) as CollectionSceneId[];
  const html = (id: CollectionSceneId) =>
    renderToStaticMarkup(
      createElement(PracticeCollectionScene, { scene: kScenes[id], onBeachPaid: noop }),
    ).replace(/&#x27;/g, "'");
  const count = (text: string, part: string) => text.split(part).length - 1;

  it.each(kIds)('%s has each of its step targets exactly once', (id) => {
    const markup = html(id);
    for (const step of COLLECTION_STEPS.filter((s) => s.place === id)) {
      expect(count(markup, `data-tour="${step.target}"`), step.target).toBe(1);
    }
  });

  it('K1 reads the strip and the three sections', () => {
    const markup = html('K1');
    for (const part of [
      '₱1,480.00',
      '₱150.00',
      'Not counting 1 session that needs setup',
      'Needs setup (1)',
      'Outstanding (1)',
      'Settled (1)',
    ]) {
      expect(markup).toContain(part);
    }
  });

  it("K2 shows Carla's payment and Mark all as paid", () => {
    const markup = html('K2');
    expect(markup).toContain('Paid ₱200.00 · ₱230.00 left');
    expect(markup).toContain('Mark all as paid');
  });

  it('K3 has two settled sessions', () => {
    expect(html('K3')).toContain('Settled (2)');
  });

  it.each(kIds)('%s never asks "Already settled?" or for a name, and has no "Need help?"', (id) => {
    const markup = html(id);
    expect(markup).not.toContain('Already settled');
    expect(markup).not.toContain('collection-help');
    expect(markup).not.toContain('What should Hati call you?');
  });
});

describe('practice isolation (BR-TG3)', () => {
  const ROOT = resolve(__dirname, '../../../..');
  const guides = resolve(__dirname);
  const files = [
    'src/hooks/useMemorySessions.ts',
    'src/lib/memorySessions.ts',
    'src/lib/practiceId.ts',
  ]
    .map((f) => join(ROOT, f))
    .concat(
      readdirSync(guides)
        .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
        .map((f) => join(guides, f)),
    );

  const RUNTIME_IMPORT = /^\s*import\s+(?!type\b)[^'"]*from\s+['"]([^'"]+)['"]/gm;
  const FORBIDDEN_IMPORT = ['@clerk/', 'useServerSessions', 'writeQueue', 'useOnboarding'];
  const FORBIDDEN_CALL = ['fetch(', 'authorisedFetch', 'useAuth', 'XMLHttpRequest', 'sendBeacon'];

  it('checks the files that matter', () => {
    expect(files.length).toBeGreaterThan(6);
  });

  it.each(files.map((f) => [f.slice(ROOT.length + 1), f]))(
    '%s imports and calls nothing that can reach the network',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      for (const [, specifier] of source.matchAll(RUNTIME_IMPORT)) {
        for (const bad of FORBIDDEN_IMPORT) expect(specifier).not.toContain(bad);
      }
      for (const bad of FORBIDDEN_CALL) expect(source).not.toContain(bad);
    },
  );
});

describe('the practice profile (AC-TG3.6)', () => {
  it('is Ana, ready, with the settled question answered', () => {
    const Probe = () => {
      const p = useProfile();
      return createElement('p', null, `${p.displayName}|${p.status}|${p.alreadySettledAnswered}`);
    };
    const markup = renderToStaticMarkup(
      createElement(PracticeProfileProvider, null, createElement(Probe)),
    );
    expect(markup).toContain('Ana|ready|true');
  });
});
