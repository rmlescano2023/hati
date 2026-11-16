/** DM Mono draws every character 0.6 em wide (DMMono-Regular.ttf: digits, separators and U+2212 alike). */
const MONO_ADVANCE = 0.6;
/** `cellNum`, `totalCellNum` and `lineCellNum` pad 3pt on each side. */
const NUM_CELL_PADDING = 6;

/**
 * The largest font size, up to `size`, at which `text` fits a number cell of
 * `columnWidth`, rounded down to 0.1pt, so an amount is never clipped or runs
 * into the next column (BR-CA35).
 */
export function fitMonoFontSize(text: string, columnWidth: number, size: number): number {
  const room = columnWidth - NUM_CELL_PADDING;
  const per = text.length * MONO_ADVANCE;
  return per * size <= room ? size : Math.floor((room / per) * 10) / 10;
}

export type ColumnWidths = {
  item: number;
  price: number;
  member: number;
};

/**
 * Work out point widths for the transaction table so it always fits the page.
 * The item column gives up space first; member columns never drop below 34pt.
 */
export function computeColumnWidths(memberCount: number, usableWidth: number): ColumnWidths {
  const price = 58;
  const minMember = 34;
  let item = 130;
  let member = memberCount > 0 ? (usableWidth - item - price) / memberCount : 0;

  if (memberCount > 0 && member < minMember) {
    item = Math.max(72, usableWidth - price - minMember * memberCount);
    member = Math.max(minMember, (usableWidth - item - price) / memberCount);
  }

  return { item, price, member };
}

/** Paper sizes in points, as react-pdf has them: [short side, long side]. */
const A4 = [595.28, 841.89] as const;
const A3 = [841.89, 1190.55] as const;
/** `styles.page` pads 40pt on the left and the right. */
const H_MARGIN = 80;

export type BreakdownPage = {
  size: 'A4' | 'A3';
  orientation: 'portrait' | 'landscape';
  /** What the tables can use: the page's width less its padding. */
  usableWidth: number;
};

/**
 * The breakdown page's paper: portrait A4 up to 5 members, landscape A4 up to 16, and landscape
 * A3 from 17 (bill-ux-polish-2 item 4), so wide member lists get readable columns.
 */
export function breakdownPage(memberCount: number): BreakdownPage {
  if (memberCount <= 5) {
    return { size: 'A4', orientation: 'portrait', usableWidth: A4[0] - H_MARGIN };
  }
  if (memberCount <= 16) {
    return { size: 'A4', orientation: 'landscape', usableWidth: A4[1] - H_MARGIN };
  }
  return { size: 'A3', orientation: 'landscape', usableWidth: A3[1] - H_MARGIN };
}
