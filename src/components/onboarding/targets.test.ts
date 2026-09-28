import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TOUR_STEPS } from './steps';

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
