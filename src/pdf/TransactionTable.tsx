import { Fragment } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { styles } from './styles';
import { formatAmount, formatPdfMoney, formatLongDate, formatSignedAmount } from '../lib/format';
import { receiptRowLabel, receiptRows, type ReceiptRow } from '../lib/bill';
import { fitMonoFontSize, type ColumnWidths } from './layout';
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

      {group.rows.map((row) => {
        // The receipt under the item, for an itemized item only (BR-CO14,
        // BR-CA34). Order names are printed as item names are.
        const lines = receiptRows(row.item);

        const itemRow = (
          <View
            style={lines ? [styles.row, { borderBottomWidth: 0 }] : styles.row}
            // Alone, an item row can't split; with lines it sits in the keep-together
            // wrapper below.
            wrap={false}
          >
            <Text style={[styles.cell, { width: columns.item }]}>{row.item.name}</Text>
            <Text style={[styles.cellNum, { width: columns.price }]}>
              {formatAmount(row.total)}
            </Text>
            {members.map((m) => {
              const share = row.shares[m] ?? 0;
              return (
                <Text
                  key={m}
                  style={[
                    styles.cellNum,
                    { width: columns.member },
                    share <= 0 ? styles.muted : {},
                  ]}
                >
                  {share > 0 ? formatAmount(share) : '—'}
                </Text>
              );
            })}
          </View>
        );

        if (!lines) return <Fragment key={row.item.id}>{itemRow}</Fragment>;

        // A sub-row's amount, shrunk to fit its column: at 17 or more members a
        // member column is 34pt, which "−300.00" doesn't fit at 7pt (BR-CA35).
        const fitted = (text: string, width: number) => ({
          fontSize: fitMonoFontSize(text, width, 7),
        });

        /** An own order's price is in its member's column; the other rows print theirs here. */
        const price = (line: ReceiptRow) =>
          line.kind === 'order'
            ? ''
            : formatSignedAmount(line.kind === 'discount' ? -line.amount : line.amount);

        const lineRow = (line: ReceiptRow, i: number) => (
          <View
            key={`${row.item.id}:${i}`}
            style={
              // The last line carries the rule an item row has, so an item and
              // its lines read as one block, as on Breakdown.
              i === lines.length - 1
                ? [styles.lineRow, { borderBottomWidth: 1, borderBottomColor: '#f0efe9' }]
                : styles.lineRow
            }
            wrap={false}
          >
            <Text style={[styles.lineCell, { width: columns.item }]}>
              {receiptRowLabel(line).text}
            </Text>
            <Text
              style={[
                styles.lineCellNum,
                { width: columns.price },
                fitted(price(line), columns.price),
              ]}
            >
              {price(line)}
            </Text>
            {members.map((m) => {
              const text = line.parts.has(m) ? formatSignedAmount(line.parts.get(m)!) : '';
              return (
                <Text
                  key={m}
                  style={[
                    styles.lineCellNum,
                    { width: columns.member },
                    fitted(text, columns.member),
                  ]}
                >
                  {text}
                </Text>
              );
            })}
          </View>
        );

        return (
          <Fragment key={row.item.id}>
            {/* The item row and its first line stay together, so an item is never
                stranded at the foot of a page; later lines may break onto the
                next page, under the repeated header (BR-CO15). */}
            <View wrap={false}>
              {itemRow}
              {lineRow(lines[0], 0)}
            </View>
            {lines.slice(1).map((line, i) => lineRow(line, i + 1))}
          </Fragment>
        );
      })}

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
