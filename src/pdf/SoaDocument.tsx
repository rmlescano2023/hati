import { Document, Link, Page, Path, Svg, Text, View } from '@react-pdf/renderer';
import { styles, palette } from './styles';
import { SettlementSection, NetBalancesSection } from './SettlementSection';
import { TransactionTable } from './TransactionTable';
import { breakdownPage, computeColumnWidths, fitMonoFontSize } from './layout';
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
import { encodeQr, qrPath } from '../lib/qr';
import { PDF_HEADING_WORD_MAX, breakLongWords, printableSessionName } from '../lib/soaName';
import type { OwedMatrix, PurchaseRecord } from '../types';

export type SoaProps = {
  members: string[];
  records: PurchaseRecord[];
  /** The session's name; null when it has none. */
  name: string | null;
  /** The organizer's invite link, on a finished session's export from History only (BR-Q4). */
  inviteUrl?: string;
};

function DocHeader({
  name,
  members,
  grandTotal,
  periodFrom,
  periodTo,
  generatedOn,
}: {
  /** Already reduced to what the font can print. */
  name: string | null;
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
        <Text style={styles.headerSub}>Statement of Account</Text>
        {name !== null && (
          // Hyphenation is off, so an unbroken run is cut by hand to stay
          // inside the column.
          <Text style={styles.headerName}>{breakLongWords(name, PDF_HEADING_WORD_MAX)}</Text>
        )}
        <Text style={styles.headerSub}>
          Period: {periodFrom} — {periodTo}
        </Text>
        <Text style={styles.headerSub}>Generated {generatedOn}</Text>
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

/** Side of the printed QR in points, quiet zone included (A5). */
const INVITE_QR_PT = 96;
/** DM Mono 8pt is 4.8pt a character, so 72 fit well inside the text column beside the QR. */
const INVITE_URL_LINE_CHARS = 72;

/**
 * Page 1's invite block: the QR on the left, and how to use it beside it (AC-31.1). Both the QR
 * and the printed link are links, so a tap in a PDF viewer opens the invite (AC-31.2).
 */
export function InviteBlock({ url }: { url: string }) {
  const matrix = encodeQr(url);
  const units = matrix.length + 8;
  return (
    <View style={styles.invite} wrap={false}>
      <Link src={url}>
        <Svg width={INVITE_QR_PT} height={INVITE_QR_PT} viewBox={`0 0 ${units} ${units}`}>
          <Path d={qrPath(matrix)} fill="#000000" />
        </Svg>
      </Link>
      <View style={styles.inviteText}>
        <Text style={styles.inviteTitle}>Track what you owe on Hati</Text>
        <Text style={styles.inviteSub}>Scan with your phone camera, or open:</Text>
        <Link src={url}>
          {/* Hyphenation is off and a link has no spaces, so it's cut by hand to stay in the column. */}
          <Text style={styles.inviteUrl}>{breakLongWords(url, INVITE_URL_LINE_CHARS)}</Text>
        </Link>
      </View>
    </View>
  );
}

export function OwedMatrixSection({
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
            const text = amount < 0 ? '—' : formatAmount(amount);
            return (
              <Text
                key={member}
                style={[
                  styles.cellNum,
                  { width: memberWidth },
                  amount > EPSILON ? styles.owes : styles.muted,
                  // Shrinks only an amount that would run into the next column, as the breakdown
                  // tables do (BR-CA35). 7.5 is `cellNum`'s size.
                  { fontSize: fitMonoFontSize(text, memberWidth, 7.5) },
                ]}
              >
                {text}
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
      <Text>Hati</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

export function SoaDocument({ members, records, name, inviteUrl }: SoaProps) {
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
  // The heading and the embedded title share one printable form, so a name
  // with nothing the font can draw reads as unnamed in both.
  const printable = printableSessionName(name);

  const page = breakdownPage(sortedMembers.length);
  const breakdownWidth = page.usableWidth;
  const columns = computeColumnWidths(sortedMembers.length, breakdownWidth);

  return (
    <Document
      title={printable ? `Hati SOA — ${printable}` : `Hati SOA — ${generatedOn}`}
      author="Hati"
      subject="Group expenses statement of account"
      creator="Hati"
      producer="Hati"
    >
      <Page size="A4" style={styles.page}>
        <DocHeader
          name={printable}
          members={sortedMembers}
          grandTotal={grandTotal}
          periodFrom={periodFrom}
          periodTo={periodTo}
          generatedOn={generatedOn}
        />
        {inviteUrl !== undefined && <InviteBlock url={inviteUrl} />}
        <SettlementSection settlements={settlements} />
        <NetBalancesSection balances={balances} />
        <Footer />
      </Page>

      <Page size={page.size} orientation={page.orientation} style={styles.page}>
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
