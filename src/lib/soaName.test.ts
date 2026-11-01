import { describe, expect, it } from 'vitest';
import { PDF_HEADING_WORD_MAX, breakLongWords, printableSessionName, soaFileName } from './soaName';

const DAY = '2026-05-05';

describe('soaFileName', () => {
  it('puts the name between the prefix and the date', () => {
    expect(soaFileName('Bali Trip', DAY)).toBe('Hati-SOA-Bali-Trip-2026-05-05.pdf');
  });

  it('turns each run of punctuation into one hyphen and trims the ends', () => {
    expect(soaFileName('Dinner: 5/6 *final*?', DAY)).toBe(`Hati-SOA-Dinner-5-6-final-${DAY}.pdf`);
  });

  it('falls back to the unnamed form when nothing usable is left', () => {
    for (const name of ['🍻🍻', '???', '🍻️', null]) {
      expect(soaFileName(name, DAY)).toBe(`Hati-SOA-${DAY}.pdf`);
    }
  });

  it('never lets a character that file systems reject through', () => {
    expect(soaFileName('a/b\\c:d*e?f"g<h>i|j', DAY)).toBe(
      `Hati-SOA-a-b-c-d-e-f-g-h-i-j-${DAY}.pdf`,
    );
  });

  it('drops leading dots, so the file is never hidden', () => {
    expect(soaFileName('..hidden', DAY)).toBe(`Hati-SOA-hidden-${DAY}.pdf`);
  });

  it('keeps underscores', () => {
    expect(soaFileName('Bali_Trip', DAY)).toBe(`Hati-SOA-Bali_Trip-${DAY}.pdf`);
  });

  it('keeps accented letters, composed or decomposed', () => {
    expect(soaFileName('Café Ñandú', DAY)).toBe(`Hati-SOA-Café-Ñandú-${DAY}.pdf`);
    expect(soaFileName('Café', DAY)).toBe(`Hati-SOA-Café-${DAY}.pdf`);
  });

  it('keeps letters from other scripts', () => {
    expect(soaFileName('東京 旅行', DAY)).toBe(`Hati-SOA-東京-旅行-${DAY}.pdf`);
  });

  it('caps the name at 40 code points with no trailing hyphen', () => {
    // The 40th character of the slug is the hyphen that replaced the space.
    const name = `${'a'.repeat(39)} ${'b'.repeat(20)}`;
    const file = soaFileName(name, DAY);
    const slug = file.slice('Hati-SOA-'.length, -`-${DAY}.pdf`.length);
    expect(Array.from(slug).length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toBe('a'.repeat(39));
  });
});

describe('printableSessionName', () => {
  it('leaves a plain name alone', () => {
    expect(printableSessionName('Bali Trip')).toBe('Bali Trip');
  });

  it('drops emoji the font cannot draw and tidies the gap they leave', () => {
    expect(printableSessionName('Bali 🍻 Trip')).toBe('Bali Trip');
  });

  it('treats a name with nothing printable as unnamed', () => {
    expect(printableSessionName('🍻🍻')).toBeNull();
    expect(printableSessionName('東京')).toBeNull();
    expect(printableSessionName(null)).toBeNull();
  });

  it('keeps punctuation the font does draw', () => {
    expect(printableSessionName('???')).toBe('???');
  });

  it('composes a decomposed accent into the glyph the font has', () => {
    expect(printableSessionName('Café')).toBe('Café');
  });

  it('drops the peso sign, which DM Sans lacks', () => {
    expect(printableSessionName('₱')).toBeNull();
  });
});

describe('breakLongWords', () => {
  it('leaves words at or under the limit untouched', () => {
    const text = `${'a'.repeat(PDF_HEADING_WORD_MAX)} short words`;
    expect(breakLongWords(text, PDF_HEADING_WORD_MAX)).toBe(text);
  });

  it('cuts an unbroken run into lines no longer than the limit', () => {
    const lines = breakLongWords('x'.repeat(60), 18).split('\n');
    expect(lines).toHaveLength(4);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(18);
    expect(lines.join('')).toBe('x'.repeat(60));
  });

  it('breaks only the word that is too long', () => {
    expect(breakLongWords(`Trip ${'y'.repeat(30)}`, 18)).toBe(
      `Trip ${'y'.repeat(18)}\n${'y'.repeat(12)}`,
    );
  });
});
