import { Text, View } from '@react-pdf/renderer';
import { styles, palette } from './styles';
import { formatPdfMoney } from '../lib/format';
import { EPSILON } from '../lib/money';
import type { NetBalance, Settlement } from '../types';

export function SettlementSection({ settlements }: { settlements: Settlement[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Final Settlement</Text>
      {settlements.length === 0 ? (
        <Text style={styles.settledUp}>Everyone is settled up.</Text>
      ) : (
        settlements.map((settlement) => (
          // Each debtor block stays whole; the surrounding section still splits.
          <View style={styles.settlementBlock} key={settlement.debtor} wrap={false}>
            <Text style={styles.settlementHead}>
              <Text style={styles.settlementDebtor}>{settlement.debtor}</Text> needs to pay
            </Text>
            {settlement.lines.map((line) => (
              <View style={styles.settlementLine} key={line.creditor}>
                <Text style={styles.settlementCreditor}>{line.creditor}</Text>
                <Text style={styles.settlementAmount}>{formatPdfMoney(line.amount)}</Text>
              </View>
            ))}
            {settlement.lines.length > 1 && (
              <View style={styles.settlementTotal}>
                <Text style={styles.headerLabel}>Total</Text>
                <Text style={[styles.settlementAmount, { fontSize: 11 }]}>
                  {formatPdfMoney(settlement.total)}
                </Text>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}

export function NetBalancesSection({ balances }: { balances: NetBalance[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Net Balances</Text>
      <View style={styles.netGrid}>
        {balances.map(({ member, amount }) => {
          const color =
            amount > EPSILON ? palette.accent : amount < -EPSILON ? palette.danger : palette.text3;
          const caption =
            amount > EPSILON ? 'is owed back' : amount < -EPSILON ? 'owes' : 'settled up';
          return (
            <View style={styles.netCard} key={member} wrap={false}>
              <View style={styles.netCardInner}>
                <Text style={styles.netName}>{member}</Text>
                <Text style={[styles.netValue, { color }]}>{formatPdfMoney(Math.abs(amount))}</Text>
                <Text style={styles.netSub}>{caption}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
