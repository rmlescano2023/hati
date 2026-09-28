import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * The serverless function runs as ESM — `package.json` declares
 * `"type": "module"` — and Vercel transpiles each file rather than bundling
 * them. ESM does not guess file extensions, so an extensionless relative
 * import resolves fine in Vite and in `vercel dev`, then fails only once
 * deployed, as `ERR_MODULE_NOT_FOUND` at request time.
 *
 * This walks what `api/` actually imports and fails on any relative import
 * without an extension, so that class of bug cannot reach a deployment again.
 */

const ROOT = resolve(__dirname, '../..');
const RELATIVE_IMPORT = /^\s*import\s+(?!type\b)[^'"]*from\s+['"](\.[^'"]*)['"]/gm;

/** Every file reachable from `api/` by a runtime relative import. */
function walk(entry: string, seen = new Set<string>()): string[] {
  if (seen.has(entry)) return [];
  seen.add(entry);

  const source = readFileSync(entry, 'utf8');
  const found: string[] = [];

  for (const [, specifier] of source.matchAll(RELATIVE_IMPORT)) {
    found.push(`${entry.slice(ROOT.length + 1)} -> ${specifier}`);
    if (specifier.endsWith('.js')) {
      const target = join(dirname(entry), specifier.replace(/\.js$/, '.ts'));
      found.push(...walk(target, seen));
    }
  }
  return found;
}

/** Every .ts under api/, at any depth — endpoints live in subdirectories. */
function endpoints(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return endpoints(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('api runtime imports', () => {
  const entries = endpoints(join(ROOT, 'api'));

  it('has at least one endpoint to check', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('uses explicit .js extensions on every relative import it can reach', () => {
    const offenders = entries.flatMap((e) => walk(e)).filter((line) => !line.endsWith('.js'));

    expect(offenders, `extensionless relative imports:\n${offenders.join('\n')}`).toEqual([]);
  });
});
