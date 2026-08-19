import { Card } from '../shared/Card';
import { ModeToggle } from '../shared/ModeToggle';
import { getMatrixRowOrder } from '../../lib/calculations';
import { formatMoney } from '../../lib/format';
import { EPSILON } from '../../lib/money';
import type { OwedMatrix as Matrix } from '../../types';
import styles from './OwedMatrix.module.css';

export type MatrixView = 'netted' | 'raw';

type Props = {
  matrix: Matrix;
  members: string[];
  view: MatrixView;
  onViewChange: (view: MatrixView) => void;
};

export function OwedMatrix({ matrix, members, view, onViewChange }: Props) {
  const rows = getMatrixRowOrder(matrix);

  return (
    <Card
      label="Amounts Owed to Each Payor"
      actions={
        <ModeToggle
          ariaLabel="Matrix view"
          value={view}
          onChange={onViewChange}
          options={[
            { value: 'netted', label: 'After Deductions' },
            { value: 'raw', label: 'Before Deductions' },
          ]}
        />
      }
    >
      {rows.length === 0 ? (
        <p className={styles.empty}>Nothing is owed to anyone.</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Payor</th>
                {members.map((m) => (
                  <th key={m}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((payor) => (
                <tr key={payor}>
                  <td>{payor}</td>
                  {members.map((member) => {
                    if (member === payor) {
                      return (
                        <td key={member} className={styles.self}>
                          —
                        </td>
                      );
                    }
                    const amount = matrix[payor]?.[member] ?? 0;
                    return (
                      <td key={member} className={amount > EPSILON ? styles.owes : styles.zero}>
                        {formatMoney(amount)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tip">
        Red values are how much that member owes the payor in that row.{' '}
        {view === 'netted'
          ? 'Mutual debts have already been cancelled out.'
          : 'Raw totals — mutual debts are still shown in both directions.'}
      </p>
    </Card>
  );
}
