/** The longest unbroken run the page-1 heading prints before forcing a line break. */
export const PDF_HEADING_WORD_MAX = 18;

/**
 * Every code point the bundled DM Sans can draw, as inclusive `[from, to]`
 * ranges. It is the cmap of `public/fonts/DMSans-{Regular,Medium,Bold}.ttf`
 * (all three are identical), read with fontkit, and must be regenerated if
 * those fonts change. The font's U+000D and U+FFFF entries are left out on
 * purpose: whitespace is collapsed before this is consulted, and U+FFFF is a
 * noncharacter. U+20B1 (the peso sign) is absent from the font, as the README
 * notes.
 */
const DM_SANS_COVERAGE: readonly (readonly [number, number])[] = [
  [0x20, 0x7e], [0xa0, 0xac], [0xae, 0x107], [0x10a, 0x11b], [0x11e, 0x123], [0x126, 0x133],
  [0x136, 0x137], [0x139, 0x148], [0x14a, 0x15b], [0x15e, 0x165], [0x168, 0x17e], [0x18f, 0x18f],
  [0x192, 0x192], [0x1fc, 0x1fd], [0x218, 0x21b], [0x237, 0x237], [0x259, 0x259], [0x2c6, 0x2c7],
  [0x2d8, 0x2dd], [0x300, 0x304], [0x306, 0x308], [0x30a, 0x30c], [0x312, 0x312], [0x326, 0x328],
  [0x3c0, 0x3c0], [0x1e80, 0x1e85], [0x1e9e, 0x1e9e], [0x1ebc, 0x1ebd], [0x1ef2, 0x1ef3],
  [0x1ef8, 0x1ef9], [0x2013, 0x2014], [0x2018, 0x201a], [0x201c, 0x201e], [0x2020, 0x2022],
  [0x2026, 0x2026], [0x2030, 0x2030], [0x2039, 0x203a], [0x2044, 0x2044], [0x2074, 0x2074],
  [0x20a8, 0x20a8], [0x20ac, 0x20ac], [0x20b9, 0x20ba], [0x20bd, 0x20bd], [0x2113, 0x2113],
  [0x2122, 0x2122], [0x2126, 0x2126], [0x212e, 0x212e], [0x2190, 0x2199], [0x2202, 0x2202],
  [0x2206, 0x2206], [0x220f, 0x220f], [0x2211, 0x2212], [0x2215, 0x2215], [0x221a, 0x221a],
  [0x221e, 0x221e], [0x222b, 0x222b], [0x2248, 0x2248], [0x2260, 0x2260], [0x2264, 0x2265],
  [0x25ca, 0x25ca], [0xfb01, 0xfb02],
];

const drawable = (char: string): boolean => {
  const cp = char.codePointAt(0)!;
  return DM_SANS_COVERAGE.some(([from, to]) => cp >= from && cp <= to);
};

/**
 * The name as the PDF can print it, shared by the page-1 heading and the
 * embedded document title so the two always agree. Characters the font has no
 * glyph for would print as empty boxes, so they are left out, and a name with
 * nothing printable left is treated as no name at all.
 */
export function printableSessionName(name: string | null): string | null {
  if (name === null) return null;
  // NFC first, so a decomposed "é" becomes the precomposed glyph the font has.
  const kept = Array.from(name.normalize('NFC')).filter(drawable).join('');
  const tidy = kept.replace(/\s+/g, ' ').trim();
  return tidy || null;
}

/**
 * Cuts any word longer than `maxChars` into pieces joined by hard line breaks.
 * Hyphenation is off for the whole document, so without this an unbroken name
 * would run out of the heading's column instead of wrapping.
 */
export function breakLongWords(text: string, maxChars: number): string {
  return text
    .split(' ')
    .map((word) => {
      const chars = Array.from(word);
      if (chars.length <= maxChars) return word;
      const pieces: string[] = [];
      for (let i = 0; i < chars.length; i += maxChars) {
        pieces.push(chars.slice(i, i + maxChars).join(''));
      }
      return pieces.join('\n');
    })
    .join(' ');
}

/**
 * The SOA's file name: `Hati-SOA-<name>-<suffix>.pdf`, or `Hati-SOA-<suffix>.pdf`
 * when the session is unnamed or its name has nothing file-safe in it. Only
 * letters, digits and underscores survive, in any script, so the name is safe
 * on every file system. Accent marks are kept with the letter they belong to,
 * so names in scripts that rely on them are not split apart by hyphens.
 */
export function soaFileName(name: string | null, suffix: string): string {
  const unnamed = `Hati-SOA-${suffix}.pdf`;
  if (name === null) return unnamed;

  let s = name.normalize('NFC');
  s = s.replace(/[^\p{L}\p{N}\p{M}_]+/gu, '-');
  // A mark with no letter or digit before it is decoration on something that
  // was just removed, such as an emoji's variation selector.
  s = s.replace(/(^|-)\p{M}+/gu, '$1');
  s = s.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  s = Array.from(s).slice(0, 40).join('').replace(/-+$/, '');

  return s ? `Hati-SOA-${s}-${suffix}.pdf` : unnamed;
}
