import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TOUR_STEPS } from './steps';
import { EXPENSES_STEPS } from './guides/expensesSteps';

/**
 * The tour finds its targets by `data-tour` attribute. Renaming one in the UI
 * would break a step silently — the tooltip would simply never appear — so
 * this checks the two sides still agree.
 */
const SRC = resolve(__dirname, '../..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(full) && !full.endsWith('.test.ts') ? [full] : [];
  });
}

/** The conditional form, which puts a guide's target on one instance of a repeated element. */
const CONDITIONAL_TARGET = /data-tour=\{[^{}]*\?\s*'([a-z-]+)'\s*:\s*undefined\s*\}/g;

/** Every `data-tour` value present in the UI, including template-literal ones. */
function declaredTargets(): Set<string> {
  const found = new Set<string>();
  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const [, value] of text.matchAll(/data-tour="([a-z-]+)"/g)) found.add(value);
    // e.g. data-tour={`tab-${id}`} over a known union
    for (const [, prefix] of text.matchAll(/data-tour=\{`([a-z-]+)-\$\{/g)) {
      found.add(`${prefix}-*`);
    }
    // e.g. data-tour={m === tourBlock ? 'sub-items' : undefined}, one instance of a repeated element
    for (const [, value] of text.matchAll(CONDITIONAL_TARGET)) found.add(value);
  }
  return found;
}

describe('tour targets', () => {
  const declared = declaredTargets();

  it('finds data-tour attributes in the UI at all', () => {
    expect(declared.size).toBeGreaterThan(0);
  });

  it.each(TOUR_STEPS.map((s) => s.target))('has an element for "%s"', (target) => {
    const prefixed = [...declared].some(
      (d) => d.endsWith('-*') && target.startsWith(d.slice(0, -1)),
    );
    expect(declared.has(target) || prefixed).toBe(true);
  });
});

describe('guide targets', () => {
  const declared = declaredTargets();

  it.each(EXPENSES_STEPS.map((s) => s.target))('has an element for "%s"', (target) => {
    const prefixed = [...declared].some(
      (d) => d.endsWith('-*') && target.startsWith(d.slice(0, -1)),
    );
    expect(declared.has(target) || prefixed).toBe(true);
  });

  /** How many places in the source declare `target`, by any of the three forms. */
  function declarations(target: string): number {
    let count = 0;
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      count += [...text.matchAll(/data-tour="([a-z-]+)"/g)].filter((m) => m[1] === target).length;
      count += [...text.matchAll(CONDITIONAL_TARGET)].filter((m) => m[1] === target).length;
      count += [...text.matchAll(/data-tour=\{`([a-z-]+)-\$\{/g)].filter((m) =>
        target.startsWith(`${m[1]}-`),
      ).length;
    }
    return count;
  }

  it.each([...new Set(EXPENSES_STEPS.map((s) => s.target))])(
    'declares "%s" in exactly one source location',
    (target) => {
      expect(declarations(target)).toBe(1);
    },
  );
});
