import { roundMoney } from './money';
import { compareNames } from './format';
import type { AppData, PurchaseItem, PurchaseRecord } from '../types';
import { SCHEMA_VERSION } from './storage';

const NAMES = [
  'Renmar',
  'Jyllan',
  'Aivan',
  'Bea Marie',
  'Carlo',
  'Dana',
  'Ezekiel',
  'Faith',
  'Gabriel',
  'Hazel',
  'Ivan',
  'Jasmine',
  'Kiel',
  'Lorenz',
];

const ITEM_NAMES = [
  'Samgyup Dinner',
  'Gin',
  'Ice And Chaser',
  'Grab Ride',
  'Grocery Run',
  'Breakfast Combo',
  'Coffee Beans',
  'Beach Cottage',
  'Boat Transfer',
  'Sunblock',
  'Charcoal',
  'Pork Belly',
  'Rice',
  'Soft Drinks',
  'Karaoke Rental',
  'Bottled Water',
  'Snacks',
  'Cooking Oil',
  'Bread And Spread',
  'Tricycle Fare',
];

/** Small deterministic PRNG so the demo set is identical every time. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A realistic data set for eyeballing responsive layout and PDF pagination
 * without typing thirty items by hand. Dev-only.
 */
export function buildDemoData(memberCount = 12, itemCount = 30): AppData {
  const rand = mulberry32(20260427);
  const members = NAMES.slice(0, Math.min(memberCount, NAMES.length)).sort(compareNames);

  const dates = ['2026-04-24', '2026-04-25', '2026-04-26', '2026-04-27', '2026-04-28'];
  const records: PurchaseRecord[] = [];

  let created = Date.UTC(2026, 3, 24, 9, 0, 0);
  for (let d = 0; d < dates.length; d += 1) {
    const perDay = Math.ceil(itemCount / dates.length);
    const multiPayor = d === 2;
    const payorA = members[d % members.length];
    const payorB = members[(d + 3) % members.length];

    const items: PurchaseItem[] = [];
    for (let i = 0; i < perDay; i += 1) {
      const index = (d * perDay + i) % ITEM_NAMES.length;
      const name = ITEM_NAMES[index];
      const price = roundMoney(120 + Math.floor(rand() * 1800) + rand());

      if (i % 4 === 3) {
        // A custom-amount item: three members chip in different amounts.
        const picks = [
          members[(i + d) % members.length],
          members[(i + d + 2) % members.length],
          members[(i + d + 5) % members.length],
        ].filter((v, k, arr) => arr.indexOf(v) === k);
        const amounts: Record<string, number> = {};
        picks.forEach((m, k) => {
          amounts[m] = roundMoney(price / picks.length + (k === 0 ? 25 : -12.5));
        });
        items.push({ id: `demo_item_${d}_${i}`, mode: 'custom', name, amounts });
      } else {
        const ownerCount = 2 + Math.floor(rand() * (members.length - 1));
        const owners = members.filter(
          (_, k) => k % Math.max(1, Math.round(members.length / ownerCount)) === 0,
        );
        items.push({
          id: `demo_item_${d}_${i}`,
          mode: 'equal',
          name,
          totalPrice: price,
          owners: owners.length > 0 ? owners : [members[0]],
        });
      }
    }

    created += 3_600_000;
    records.push({
      id: `demo_rec_${d}`,
      date: dates[d],
      payorMode: multiPayor ? 'multiple' : 'single',
      payors: multiPayor
        ? [
            { member: payorA, amount: 3000 },
            { member: payorB, amount: 1000 },
          ]
        : [{ member: payorA, amount: 0 }],
      items,
      createdAt: new Date(created).toISOString(),
    });
  }

  // A second save on an existing date + payor, to exercise breakdown merging.
  records.push({
    id: 'demo_rec_merge',
    date: dates[0],
    payorMode: 'single',
    payors: [{ member: members[0], amount: 0 }],
    items: [
      {
        id: 'demo_item_merge',
        mode: 'equal',
        name: 'Late Night Ramen',
        totalPrice: 890.5,
        owners: members.slice(0, Math.min(4, members.length)),
      },
    ],
    createdAt: new Date(created + 7_200_000).toISOString(),
  });

  return { schemaVersion: SCHEMA_VERSION, members, records };
}
