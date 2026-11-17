import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EXPENSES_STEPS } from './expensesSteps';
import { expensesScenes, type ExpensesSceneId } from './expensesScenes';
import { PracticeScene } from './PracticeExpenses';
import { PracticeProfileProvider, useProfile } from '../../../context/ProfileContext';
import { billAmounts, billMatches, billMembers } from '../../../lib/bill';
import { getItemTotal } from '../../../lib/calculations';
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
