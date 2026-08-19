import { Text, View } from '@react-pdf/renderer';
import { styles } from './styles';
import { formatAmount, formatPdfMoney, formatLongDate } from '../lib/format';
import type { ColumnWidths } from './layout';
import type { BreakdownGroup } from '../types';

type Props = {
  group: BreakdownGroup;
  members: string[];
  columns: ColumnWidths;
};

/**
 * One date/payor group.
 *
 * Pagination contract (this is the v1.1.7 bug fix):
 * - the group container is left splittable (no `wrap={false}`), so a long table
 *   cuts across pages instead of jumping wholesale to the next one;
 * - only individual rows carry `wrap={false}`, so a row's cells never split;
 * - the header row is `fixed`, so it reprints at the top of each continuation;
 * - the group title carries `minPresenceAhead` so it is never stranded alone at
 *   the bottom of a page.
 */
export function TransactionTable({ group, members, columns }: Props) {
  return (
    <View style={styles.tableGroup}>
      {/*
       * react-pdf skips a break for the *first* child of a container
       * (`breakingImprovesPresence` is false when nothing precedes it), which
       * would make the `minPresenceAhead` below a no-op. This zero-height
       * anchor gives the title a predecessor so the rule actually applies.
       */}
      <View style={styles.groupAnchor} />
      <View style={styles.groupHeader} minPresenceAhead={110}>
        <Text style={styles.groupDate}>{formatLongDate(group.date)}</Text>
        <View style={styles.payorRow}>
          {group.payorMode === 'single' || group.payors.length === 1 ? (
            <Text style={styles.payorBadge}>Paid by {group.payors[0]?.member ?? '—'}</Text>
          ) : (
            group.payors.map((p) => (
              <Text style={styles.payorBadge} key={p.member}>
                {p.member} {formatPdfMoney(p.amount)}
              </Text>
            ))
          )}
        </View>
      </View>

      {/* `fixed` reprints this header on every page the group flows onto. */}
      <View style={styles.headRow} fixed>
        <Text style={[styles.headCell, { width: columns.item }]}>Item</Text>
        <Text style={[styles.headCell, { width: columns.price, textAlign: 'right' }]}>Price</Text>
        {members.map((m) => (
          <Text key={m} style={[styles.headCell, { width: columns.member, textAlign: 'right' }]}>
            {m}
          </Text>
        ))}
      </View>

      {group.rows.map((row) => (
        <View style={styles.row} key={row.item.id} wrap={false}>
          <Text style={[styles.cell, { width: columns.item }]}>{row.item.name}</Text>
          <Text style={[styles.cellNum, { width: columns.price }]}>{formatAmount(row.total)}</Text>
          {members.map((m) => {
            const share = row.shares[m] ?? 0;
            return (
              <Text
                key={m}
                style={[styles.cellNum, { width: columns.member }, share <= 0 ? styles.muted : {}]}
              >
                {share > 0 ? formatAmount(share) : '—'}
              </Text>
            );
          })}
        </View>
      ))}

      <View style={styles.totalRow} wrap={false}>
        <Text style={[styles.totalCell, { width: columns.item }]}>Total</Text>
        <Text style={[styles.totalCellNum, { width: columns.price }]}>
          {formatAmount(group.grandTotal)}
        </Text>
        {members.map((m) => (
          <Text key={m} style={[styles.totalCellNum, { width: columns.member }]}>
            {group.totals[m] > 0 ? formatAmount(group.totals[m]) : '—'}
          </Text>
        ))}
      </View>
    </View>
  );
}
