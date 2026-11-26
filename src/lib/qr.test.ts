import { describe, expect, it } from 'vitest';
import {
  GF_EXP,
  GF_LOG,
  QR_BYTE_CAPACITY,
  encodeQr,
  formatWord,
  maskPenalties,
  qrPath,
  rsGenerator,
  rsRemainder,
  versionWord,
} from './qr';
import { QR_GOLDEN, QR_GOLDEN_PENALTIES } from './qr.fixtures';

const rowsOf = (matrix: boolean[][]) =>
  matrix.map((row) => row.map((d) => (d ? '1' : '0')).join(''));

/** The version whose capacity holds `bytes`, worked out here from the capacities, not the encoder. */
const versionFor = (bytes: number) => QR_BYTE_CAPACITY.findIndex((cap) => bytes <= cap) + 1;

describe('GF(256) (ISO 18004 Annex A)', () => {
  it('starts as the powers of two and wraps through 0x11D', () => {
    expect(GF_EXP).toHaveLength(255);
    expect(GF_EXP.slice(0, 10)).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 29, 58]);
    expect(GF_EXP[254]).toBe(142);
  });

  it('holds each of 1 to 255 exactly once, and GF_LOG inverts it', () => {
    expect([...GF_EXP].sort((a, b) => a - b)).toEqual(Array.from({ length: 255 }, (_, i) => i + 1));
    expect(GF_LOG).toHaveLength(256);
    for (let i = 0; i < 255; i++) expect(GF_LOG[GF_EXP[i]]).toBe(i);
  });
});

describe('Reed-Solomon', () => {
  const generatorExponents: Record<number, number[]> = {
    10: [0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45],
    16: [0, 120, 104, 107, 109, 102, 161, 76, 3, 91, 191, 147, 169, 182, 194, 225, 120],
    18: [0, 215, 234, 158, 94, 184, 97, 118, 170, 79, 187, 152, 148, 252, 179, 5, 98, 96, 153],
    22: [
      0, 210, 171, 247, 242, 93, 230, 14, 109, 221, 53, 200, 74, 8, 172, 98, 80, 219, 134, 160, 105,
      165, 231,
    ],
    24: [
      0, 229, 121, 135, 48, 211, 117, 251, 126, 159, 180, 169, 152, 192, 226, 228, 218, 111, 0, 117,
      232, 87, 96, 227, 21,
    ],
    26: [
      0, 173, 125, 158, 2, 103, 182, 118, 17, 145, 201, 111, 28, 165, 53, 161, 21, 245, 142, 13,
      102, 48, 227, 153, 145, 218, 70,
    ],
  };

  it.each(Object.entries(generatorExponents))(
    'the degree-%s generator matches the published exponents of alpha',
    (degree, exponents) => {
      expect(rsGenerator(Number(degree)).map((c) => GF_LOG[c])).toEqual(exponents);
    },
  );

  it('gives the well-known 1-M example its error-correction codewords', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
});

describe('format and version words (ISO 18004 Tables C.1 and D.1)', () => {
  const table = {
    L: [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
    M: [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0],
    Q: [0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed],
    H: [0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b],
  } as const;

  it.each(Object.entries(table))('level %s, all eight masks', (level, words) => {
    const got = [0, 1, 2, 3, 4, 5, 6, 7].map((mask) =>
      formatWord(level as 'L' | 'M' | 'Q' | 'H', mask),
    );
    expect(got).toEqual(words);
  });

  it('gives versions 7 to 10 their version words', () => {
    expect([7, 8, 9, 10].map(versionWord)).toEqual([0x07c94, 0x085bc, 0x09a99, 0x0a4d3]);
  });
});

describe('capacity', () => {
  it('is the byte-mode capacity at level M for versions 1 to 10', () => {
    expect(QR_BYTE_CAPACITY).toEqual([14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
  });

  it('moves up a version one byte past each capacity, and stops at 213', () => {
    expect(encodeQr('a'.repeat(84))).toHaveLength(37);
    expect(encodeQr('a'.repeat(85))).toHaveLength(41);
    expect(encodeQr('a'.repeat(213))).toHaveLength(57);
    expect(() => encodeQr('a'.repeat(214))).toThrow(RangeError);
  });

  it('counts a multi-byte character as its UTF-8 bytes', () => {
    expect(encodeQr('₱'.repeat(28))).toHaveLength(37);
    expect(encodeQr('₱'.repeat(29))).toHaveLength(41);
  });
});

describe('structure', () => {
  const finderOk = (m: boolean[][], top: number, left: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const dark = Math.max(Math.abs(r - 3), Math.abs(c - 3)) !== 2;
        expect(m[top + r][left + c], `finder at ${top},${left} offset ${r},${c}`).toBe(dark);
      }
    }
  };

  const separatorOk = (m: boolean[][], top: number, left: number) => {
    const size = m.length;
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) continue;
        const y = top + r;
        const x = left + c;
        if (y < 0 || x < 0 || y >= size || x >= size) continue;
        expect(m[y][x], `separator at ${y},${x}`).toBe(false);
      }
    }
  };

  // Annex E, written out again here rather than imported.
  const alignmentCentres: Record<number, number[]> = {
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50],
  };

  const bitsAt = (m: boolean[][], cells: [number, number][]) =>
    cells.reduce((word, [r, c], i) => word | ((m[r][c] ? 1 : 0) << i), 0);

  const check = (text: string) => {
    const bytes = new TextEncoder().encode(text).length;
    const v = versionFor(bytes);
    const m = encodeQr(text);
    const size = m.length;
    expect(size).toBe(17 + 4 * v);

    finderOk(m, 0, 0);
    finderOk(m, 0, size - 7);
    finderOk(m, size - 7, 0);
    separatorOk(m, 0, 0);
    separatorOk(m, 0, size - 7);
    separatorOk(m, size - 7, 0);

    for (let i = 8; i <= size - 9; i++) {
      expect(m[6][i], `row timing ${i}`).toBe(i % 2 === 0);
      expect(m[i][6], `column timing ${i}`).toBe(i % 2 === 0);
    }

    expect(m[4 * v + 9][8]).toBe(true);

    if (v >= 2) {
      const centres = alignmentCentres[v];
      const last = centres[centres.length - 1];
      for (const cy of centres) {
        for (const cx of centres) {
          if ((cy === 6 && cx === 6) || (cy === 6 && cx === last) || (cy === last && cx === 6))
            continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
              expect(m[cy + dr][cx + dc], `alignment ${cy},${cx} offset ${dr},${dc}`).toBe(dark);
            }
          }
        }
      }
    }

    // Both copies of the format word, read back from ISO 18004's positions.
    const copy1: [number, number][] = [];
    for (let i = 0; i < 6; i++) copy1.push([i, 8]);
    copy1.push([7, 8], [8, 8], [8, 7]);
    for (let i = 9; i < 15; i++) copy1.push([8, 14 - i]);
    const copy2: [number, number][] = [];
    for (let i = 0; i < 8; i++) copy2.push([8, size - 1 - i]);
    for (let i = 8; i < 15; i++) copy2.push([size - 15 + i, 8]);
    const word1 = bitsAt(m, copy1);
    expect(bitsAt(m, copy2)).toBe(word1);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((k) => formatWord('M', k))).toContain(word1);

    if (v >= 7) {
      const upperRight: [number, number][] = [];
      const lowerLeft: [number, number][] = [];
      for (let i = 0; i < 18; i++) {
        upperRight.push([Math.floor(i / 3), size - 11 + (i % 3)]);
        lowerLeft.push([size - 11 + (i % 3), Math.floor(i / 3)]);
      }
      expect(bitsAt(m, upperRight)).toBe(versionWord(v));
      expect(bitsAt(m, lowerLeft)).toBe(versionWord(v));
    }
  };

  it('holds for every length from 1 to 213 bytes', () => {
    for (let n = 1; n <= 213; n++) check('a'.repeat(n));
  });

  it('holds for every golden text', () => {
    for (const g of QR_GOLDEN) check(g.text);
  });
});

describe('golden matrices from the reference encoder (segno 1.6.6)', () => {
  it.each(QR_GOLDEN.map((g, i) => [i, g] as const))('entry %i matches bit for bit', (_, g) => {
    const m = encodeQr(g.text, g.auto ? undefined : g.mask);
    expect(m).toHaveLength(17 + 4 * g.version);
    expect(rowsOf(m)).toEqual(g.rows);
  });
});

describe('mask penalties (ISO 18004 7.8.3)', () => {
  it("match the reference encoder's N1 to N4 for each mask", () => {
    expect(maskPenalties(QR_GOLDEN_PENALTIES.text)).toEqual(QR_GOLDEN_PENALTIES.scores);
  });
});

describe('qrPath', () => {
  it('draws each horizontal run of dark modules as one rectangle', () => {
    const m = [
      [true, true, false],
      [false, true, true],
    ];
    expect(qrPath(m, 0)).toBe('M0 0h2v1h-2zM1 1h2v1h-2z');
    expect(qrPath(m)).toBe('M4 4h2v1h-2zM5 5h2v1h-2z');
  });

  it('reads back as exactly the dark modules of every golden matrix, with no touching runs', () => {
    for (const g of QR_GOLDEN) {
      const m = encodeQr(g.text, g.auto ? undefined : g.mask);
      const back = m.map((row) => row.map(() => false));
      const runs: Record<number, [number, number][]> = {};
      for (const [, x, y, w] of qrPath(m).matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
        const col = Number(x) - 4;
        const row = Number(y) - 4;
        for (let i = 0; i < Number(w); i++) back[row][col + i] = true;
        (runs[row] ??= []).push([col, col + Number(w)]);
      }
      expect(back).toEqual(m);
      for (const row of Object.values(runs)) {
        for (let i = 1; i < row.length; i++) expect(row[i][0]).toBeGreaterThan(row[i - 1][1]);
      }
    }
  });
});
