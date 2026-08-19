import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles, palette } from './styles';
import { SettlementSection, NetBalancesSection } from './SettlementSection';
import { TransactionTable } from './TransactionTable';
import { computeColumnWidths } from './layout';
import {
  getFinalSettlement,
  getGrandTotal,
  getMatrixRowOrder,
  getNetBalances,
  getNettedOwedMatrix,
  getRawOwedMatrix,
  groupRecordsForBreakdown,
} from '../lib/calculations';
import {
  compareNames,
  formatAmount,
  formatLongDate,
  formatPdfMoney,
  sortNames,
  todayIso,
} from '../lib/format';
import { EPSILON } from '../lib/money';
import type { OwedMatrix, PurchaseRecord } from '../types';

export type EsoaProps = {
  members: string[];
  records: PurchaseRecord[];
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const H_MARGIN = 80;

/** Wide member lists get a landscape breakdown page rather than unreadable columns. */
const needsLandscape = (memberCount: number) => memberCount > 5;

function DocHeader({
  members,
  grandTotal,
  periodFrom,
  periodTo,
  generatedOn,
}: {
  members: string[];
  grandTotal: number;
  periodFrom: string;
  periodTo: string;
  generatedOn: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.wordmark}>Hati</Text>
        <Text style={styles.headerSub}>Electronic Statement of Account</Text>
        <Text style={styles.headerSub}>
          Period: {periodFrom} — {periodTo}
        </Text>
        <Text style={styles.headerSub}>Generated {generatedOn}</Text>
        <Text style={[styles.headerSub, { marginTop: 4 }]}>
          All amounts are in Philippine Pesos (PHP).
        </Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerLabel}>Members</Text>
        <Text style={styles.headerValue}>{members.join(', ')}</Text>
        <Text style={[styles.headerLabel, { marginTop: 8 }]}>Grand Total</Text>
        <Text style={styles.grandTotal}>{formatPdfMoney(grandTotal)}</Text>
      </View>
    </View>
  );
}

function OwedMatrixSection({
  matrix,
  members,
  usableWidth,
}: {
  matrix: OwedMatrix;
  members: string[];
  usableWidth: number;
}) {
  const rows = getMatrixRowOrder(matrix);
  if (rows.length === 0) return null;

  const payorWidth = 92;
  const memberWidth = (usableWidth - payorWidth) / Math.max(1, members.length);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Amounts Owed to Each Payor (After Deductions)</Text>
      <View style={styles.headRow} fixed>
        <Text style={[styles.headCell, { width: payorWidth }]}>Payor</Text>
        {members.map((m) => (
          <Text key={m} style={[styles.headCell, { width: memberWidth, textAlign: 'right' }]}>
            {m}
          </Text>
        ))}
      </View>
      {rows.map((payor) => (
        <View style={styles.row} key={payor} wrap={false}>
          <Text style={[styles.cell, { width: payorWidth, fontWeight: 700 }]}>{payor}</Text>
          {members.map((member) => {
            const amount = member === payor ? -1 : (matrix[payor]?.[member] ?? 0);
            return (
              <Text
                key={member}
                style={[
                  styles.cellNum,
                  { width: memberWidth },
                  amount > EPSILON ? styles.owes : styles.muted,
                ]}
              >
                {amount < 0 ? '—' : formatAmount(amount)}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>Hati — Group Expenses</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

export function EsoaDocument({ members, records }: EsoaProps) {
  const sortedMembers = sortNames(members);
  const groups = groupRecordsForBreakdown(records, sortedMembers, 'asc');
  const raw = getRawOwedMatrix(records, sortedMembers);
  const netted = getNettedOwedMatrix(raw);
  const balances = getNetBalances(netted, sortedMembers);
  const settlements = getFinalSettlement(netted, sortedMembers);
  const grandTotal = getGrandTotal(records);

  const dates = records.map((r) => r.date).sort();
  const periodFrom = dates.length > 0 ? formatLongDate(dates[0]) : '—';
  const periodTo = dates.length > 0 ? formatLongDate(dates[dates.length - 1]) : '—';
  const generatedOn = formatLongDate(todayIso());

  const landscape = needsLandscape(sortedMembers.length);
  const breakdownWidth = (landscape ? A4_HEIGHT : A4_WIDTH) - H_MARGIN;
  const columns = computeColumnWidths(sortedMembers.length, breakdownWidth);

  return (
    <Document
      title={`Hati eSOA — ${generatedOn}`}
      author="Hati"
      subject="Group expenses statement of account"
      creator="Hati"
      producer="Hati"
    >
      <Page size="A4" style={styles.page}>
        <DocHeader
          members={sortedMembers}
          grandTotal={grandTotal}
          periodFrom={periodFrom}
          periodTo={periodTo}
          generatedOn={generatedOn}
        />
        <SettlementSection settlements={settlements} />
        <NetBalancesSection balances={balances} />
        <Footer />
      </Page>

      <Page size="A4" orientation={landscape ? 'landscape' : 'portrait'} style={styles.page}>
        <Text style={[styles.wordmark, { fontSize: 13, marginBottom: 14 }]}>
          Transaction Breakdown
        </Text>
        <OwedMatrixSection matrix={netted} members={sortedMembers} usableWidth={breakdownWidth} />
        {groups.length === 0 ? (
          <Text style={{ color: palette.text3 }}>No transactions recorded.</Text>
        ) : (
          groups
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date) || compareNames(a.key, b.key))
            .map((group) => (
              <TransactionTable
                key={group.key}
                group={group}
                members={sortedMembers}
                columns={columns}
              />
            ))
        )}
        <Footer />
      </Page>
    </Document>
  );
}
