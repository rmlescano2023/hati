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
