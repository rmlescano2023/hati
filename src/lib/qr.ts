/* A QR encoder for the invite link, written by hand so the app carries no dependency for it.
   Byte mode at error-correction level M, versions 1 to 10, which is all an invite link ever needs.
   Section numbers cite ISO/IEC 18004:2015. The tests compare whole matrices with a reference
   encoder's output (src/lib/qr.fixtures.ts), so a slip here shows up as a failing matrix. */

/** A QR symbol, row by row from the top, left to right; true is a dark module. No quiet zone. */
export type QrMatrix = boolean[][];

/** Per version 1 to 10: [EC codewords per block, group-1 blocks, data codewords each, group-2 blocks, data codewords each] (Table 9, level M). */
const BLOCKS = [
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
] as const;

/** Alignment-pattern centre coordinates, versions 2 to 10 (Annex E); version 1 has none. */
const ALIGNMENT = [
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
] as const;

const dataCodewords = (version: number) => {
  const [, g1n, g1d, g2n, g2d] = BLOCKS[version - 1];
  return g1n * g1d + g2n * g2d;
};

/** The length field is 8 bits up to version 9 and 16 bits from version 10 (Table 3). */
const countBits = (version: number) => (version <= 9 ? 8 : 16);

/**
 * Byte-mode capacity at level M for versions 1 to 10, derived from BLOCKS:
 * [14, 26, 42, 62, 84, 106, 122, 152, 180, 213].
 */
export const QR_BYTE_CAPACITY: readonly number[] = BLOCKS.map((_, i) =>
  Math.floor((8 * dataCodewords(i + 1) - 4 - countBits(i + 1)) / 8),
);

/* ---------------------------- Reed-Solomon (Annex A) --------------------------- */

/** α^i for i = 0 to 254 in GF(256) with the primitive polynomial x⁸+x⁴+x³+x²+1 (0x11D). Test-only export. */
export const GF_EXP: readonly number[] = (() => {
  const exp: number[] = [];
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp.push(x);
    x <<= 1;
    if (x >= 256) x ^= 0x11d;
  }
  return exp;
})();

/** The inverse of GF_EXP for 1 to 255. GF_LOG[0] is unused and 0. Test-only export. */
export const GF_LOG: readonly number[] = (() => {
  const log: number[] = new Array(256).fill(0);
  GF_EXP.forEach((value, i) => {
    log[value] = i;
  });
  return log;
})();

const gfMul = (a: number, b: number) =>
  a === 0 || b === 0 ? 0 : GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];

/** The generator polynomial Π(x − α^i), i = 0 to degree − 1, highest power first; [0] is 1. Test-only export. */
export function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    poly.forEach((coefficient, j) => {
      next[j] ^= coefficient;
      next[j + 1] ^= gfMul(coefficient, GF_EXP[i]);
    });
    poly = next;
  }
  return poly;
}

/** The `degree` error-correction codewords of `data`: data(x)·x^degree mod generator. Test-only export. */
export function rsRemainder(data: readonly number[], degree: number): number[] {
  const generator = rsGenerator(degree);
  const work = [...data, ...new Array<number>(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const lead = work[i];
    if (lead === 0) continue;
    for (let j = 0; j <= degree; j++) work[i + j] ^= gfMul(generator[j], lead);
  }
  return work.slice(data.length);
}

/* ------------------------------ Format and version ----------------------------- */

const LEVEL_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 } as const;

/** The 15-bit format word, already XORed with 0x5412 (7.9, Table C.1). Test-only export. */
export function formatWord(level: 'L' | 'M' | 'Q' | 'H', mask: number): number {
  const data = (LEVEL_BITS[level] << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if (rem & (1 << i)) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

/** The 18-bit version word for versions 7 and up (7.10, Table D.1). Test-only export. */
export function versionWord(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) if (rem & (1 << i)) rem ^= 0x1f25 << (i - 12);
  return (version << 12) | rem;
}

/* ------------------------------------ Codewords ------------------------------------ */

/** The data, error correction and interleaving of 7.4 to 7.6, as a list of bits, most significant first. */
function codewordBits(bytes: Uint8Array, version: number): boolean[] {
  const [ec, g1n, g1d, g2n, g2d] = BLOCKS[version - 1];
  const capacityBits = 8 * dataCodewords(version);

  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, countBits(version));
  bytes.forEach((byte) => push(byte, 8));
  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  push(0, (8 - (bits.length % 8)) % 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataCodewords(version); pad ^= 0xec ^ 0x11) data.push(pad);

  const blocks: number[][] = [];
  let at = 0;
  for (const [count, size] of [
    [g1n, g1d],
    [g2n, g2d],
  ]) {
    for (let i = 0; i < count; i++, at += size) blocks.push(data.slice(at, at + size));
  }
  const checks = blocks.map((block) => rsRemainder(block, ec));

  const final: number[] = [];
  const longest = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) blocks.forEach((b) => i < b.length && final.push(b[i]));
  for (let i = 0; i < ec; i++) checks.forEach((c) => final.push(c[i]));

  return final.flatMap((codeword) =>
    Array.from({ length: 8 }, (_, i) => ((codeword >> (7 - i)) & 1) === 1),
  );
}

/* --------------------------------- Function patterns --------------------------------- */

type Grid = { modules: boolean[][]; reserved: boolean[][] };

/** A grid with the finders, separators, timing, alignment patterns and the format and version areas (7.3, 7.7.2). */
function functionPatterns(version: number): Grid {
  const size = 17 + 4 * version;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const mark = (y: number, x: number, dark?: boolean) => {
    if (y < 0 || x < 0 || y >= size || x >= size) return;
    reserved[y][x] = true;
    if (dark !== undefined) modules[y][x] = dark;
  };

  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        mark(top + r, left + c, inside && Math.max(Math.abs(r - 3), Math.abs(c - 3)) !== 2);
      }
    }
  }

  for (let i = 8; i <= size - 9; i++) {
    mark(6, i, i % 2 === 0);
    mark(i, 6, i % 2 === 0);
  }

  if (version >= 2) {
    const centres = ALIGNMENT[version - 2];
    const last = centres[centres.length - 1];
    for (const cy of centres) {
      for (const cx of centres) {
        if ((cy === 6 && cx === 6) || (cy === 6 && cx === last) || (cy === last && cx === 6))
          continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++)
            mark(cy + dr, cx + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // The format areas stay light until the mask is chosen, and the timing modules keep their colour.
  for (let i = 0; i <= 8; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(8, size - 1 - i);
    mark(size - 1 - i, 8);
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        mark(i, size - 11 + j);
        mark(size - 11 + j, i);
      }
    }
  }
  return { modules, reserved };
}

/** Writes the codeword bits into the free modules in 7.7.3's zigzag, two columns at a time. */
function placeCodewords({ modules, reserved }: Grid, bits: boolean[]) {
  const size = modules.length;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!reserved[y][x] && i < bits.length) modules[y][x] = bits[i++];
      }
    }
  }
  // Any modules left over are the remainder bits, and stay light.
}

/* ------------------------------------- Masks ------------------------------------- */

/** The eight data mask conditions (7.8.2, Table 10); i is the row and j the column. */
const MASKS: ((i: number, j: number) => boolean)[] = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

/** A copy of the grid's modules with the mask flipped over every module that isn't a function module. */
function applyMask({ modules, reserved }: Grid, mask: number): boolean[][] {
  return modules.map((row, i) =>
    row.map((dark, j) => (reserved[i][j] ? dark : dark !== MASKS[mask](i, j))),
  );
}

/** [N1, N2, N3, N4] of one masked symbol (7.8.3.1). */
function penalty(grid: boolean[][]): [number, number, number, number] {
  const size = grid.length;
  const lines = [...grid, ...grid.map((_, x) => grid.map((row) => row[x]))];
  const finder = [true, false, true, true, true, false, true];
  const allLight = (line: boolean[], from: number, to: number) =>
    line.slice(from, to).every((m) => !m);

  let n1 = 0;
  let n3 = 0;
  for (const line of lines) {
    // N1: a run of five or more modules of one colour scores its length minus two.
    for (let start = 0, i = 1; i <= size; i++) {
      if (i === size || line[i] !== line[start]) {
        if (i - start >= 5) n1 += i - start - 2;
        start = i;
      }
    }
    // N3: 1:1:3:1:1 beside four light modules. The restart positions decide whether overlapping
    // finds count, so they follow the reference encoder exactly. An empty range counts as light,
    // because the quiet zone is.
    const find = (from: number) => {
      for (let i = from; i + 7 <= size; i++)
        if (finder.every((dark, k) => line[i + k] === dark)) return i;
      return -1;
    };
    for (let idx = find(0); idx >= 0;) {
      const after = idx + 7;
      if (
        allLight(line, Math.max(idx - 4, 0), idx) ||
        allLight(line, after, Math.min(after + 4, size))
      ) {
        n3 += 40;
        idx = find(after);
      } else {
        idx = find(idx + 4);
      }
    }
  }

  // N2: every 2x2 square of one colour scores 3, and squares overlap.
  let n2 = 0;
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = grid[r][c];
      if (grid[r][c + 1] === v && grid[r + 1][c] === v && grid[r + 1][c + 1] === v) n2 += 3;
    }
  }

  // N4: 10 points for each full 5% the dark share is away from half, in integers.
  const dark = grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const total = size * size;
  const n4 = 10 * Math.floor(Math.abs(100 * dark - 50 * total) / (5 * total));
  return [n1, n2, n3, n4];
}

/** Draws the format word (twice), the always-dark module and, from version 7, the version word (7.9, 7.10). */
function drawInformation(grid: boolean[][], version: number, mask: number) {
  const size = grid.length;
  const word = formatWord('M', mask);
  for (let i = 0; i < 15; i++) {
    const bit = ((word >> i) & 1) === 1;
    const [y1, x1] =
      i < 6 ? [i, 8] : i === 6 ? [7, 8] : i === 7 ? [8, 8] : i === 8 ? [8, 7] : [8, 14 - i];
    const [y2, x2] = i < 8 ? [8, size - 1 - i] : [size - 15 + i, 8];
    grid[y1][x1] = bit;
    grid[y2][x2] = bit;
  }
  grid[size - 8][8] = true;
  if (version >= 7) {
    const info = versionWord(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((info >> i) & 1) === 1;
      grid[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
      grid[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
    }
  }
}

/** The symbol before masking, and its version. */
function build(text: string) {
  const bytes = new TextEncoder().encode(text);
  const version = QR_BYTE_CAPACITY.findIndex((capacity) => bytes.length <= capacity) + 1;
  if (version === 0) {
    throw new RangeError(
      `An invite QR holds at most ${QR_BYTE_CAPACITY[QR_BYTE_CAPACITY.length - 1]} bytes; this text is ${bytes.length}.`,
    );
  }
  const grid = functionPatterns(version);
  placeCodewords(grid, codewordBits(bytes, version));
  return { grid, version };
}

/**
 * [N1, N2, N3, N4] for each mask 0 to 7 of `text`, as scored when choosing. Each candidate is
 * scored before the format word, the dark module and the version word are drawn, as 7.8.3
 * prescribes. Test-only export.
 */
export function maskPenalties(text: string): [number, number, number, number][] {
  const { grid } = build(text);
  return MASKS.map((_, mask) => penalty(applyMask(grid, mask)));
}

/**
 * Encodes `text` as UTF-8 bytes in byte mode at error-correction level M, in the smallest version
 * from 1 to 10 that holds it. `mask` forces a mask pattern (0 to 7); the tests use it to compare
 * every mask with the reference encoder. Without it, the mask with the lowest penalty is chosen,
 * the lower number on a tie. Throws a RangeError past 213 bytes.
 */
export function encodeQr(text: string, mask?: number): QrMatrix {
  const { grid, version } = build(text);
  let chosen = mask;
  if (chosen === undefined) {
    let best = Infinity;
    MASKS.forEach((_, candidate) => {
      const total = penalty(applyMask(grid, candidate)).reduce((a, b) => a + b, 0);
      if (total < best) {
        best = total;
        chosen = candidate;
      }
    });
  }
  const symbol = applyMask(grid, chosen as number);
  drawInformation(symbol, version, chosen as number);
  return symbol;
}

/**
 * One SVG path for the dark modules, in module units, shifted by a `quiet`-module border on every
 * side. Each horizontal run of dark modules in a row is one rectangle, so a version 5 symbol is a
 * few hundred short subpaths rather than about 700 squares. The caller's viewBox is `0 0 S S` with
 * S = matrix.length + 2 * quiet.
 */
export function qrPath(matrix: QrMatrix, quiet = 4): string {
  let path = '';
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      path += `M${start + quiet} ${y + quiet}h${x - start}v1h-${x - start}z`;
    }
  });
  return path;
}
