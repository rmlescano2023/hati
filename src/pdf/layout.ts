/** DM Mono draws every character 0.6 em wide (DMMono-Regular.ttf: digits, separators and U+2212 alike). */
const MONO_ADVANCE = 0.6;
/** `cellNum` and `lineCellNum` pad 3pt on each side. */
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
