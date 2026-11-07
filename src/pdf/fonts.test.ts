import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Font } from '@react-pdf/renderer';

// Outside a browser a bare path is read as a file, so the fonts are given an
// origin to be fetched from, which has to be set before the module reads it.
let registerPdfFonts: typeof import('./fonts').registerPdfFonts;
let resetFailedPdfFonts: typeof import('./fonts').resetFailedPdfFonts;
beforeAll(async () => {
  vi.stubEnv('BASE_URL', 'http://localhost/');
  ({ registerPdfFonts, resetFailedPdfFonts } = await import('./fonts'));
});

const face = { fontFamily: 'DM Sans', fontWeight: 400 } as const;
const offline = () => {
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
};
const online = () => {
  vi.stubGlobal(
    'fetch',
    async () => new Response(await readFile('public/fonts/DMSans-Regular.ttf')),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetFailedPdfFonts();
});

describe('PDF fonts after a failed download', () => {
  it('replay the failure on every later export until reset', async () => {
    offline();
    registerPdfFonts();
    await expect(Font.load(face)).rejects.toThrow('Failed to fetch');

    // The network is back, but the font remembers its rejected load.
    online();
    await expect(Font.load(face)).rejects.toThrow('Failed to fetch');
  });

  it('load again once reset, so a retry after the network recovers works', async () => {
    offline();
    registerPdfFonts();
    await expect(Font.load(face)).rejects.toThrow();

    resetFailedPdfFonts();
    online();
    await expect(Font.load(face)).resolves.toBeUndefined();
    expect(Font.getFont(face).data).not.toBeNull();
  });

  it('keep a face that loaded, so it is fetched only once', async () => {
    online();
    registerPdfFonts();
    await Font.load(face);
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    resetFailedPdfFonts();
    await Font.load(face);
    expect(fetched).not.toHaveBeenCalled();
  });

  it('leave the renderer built-in fonts registered', () => {
    registerPdfFonts();
    resetFailedPdfFonts();
    expect(Font.getRegisteredFontFamilies()).toContain('Helvetica');
  });

  it('register each family once however often it is asked', () => {
    registerPdfFonts();
    registerPdfFonts();
    expect(Font.getRegisteredFonts()['DM Sans'].sources).toHaveLength(3);
  });
});
