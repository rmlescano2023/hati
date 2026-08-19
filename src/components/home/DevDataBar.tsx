import { Button } from '../shared/Button';
import { useAppData } from '../../context/AppDataContext';
import { buildDemoData } from '../../lib/demoData';
import styles from './DevDataBar.module.css';

/**
 * Dev-only seeding controls, for checking the responsive layout and PDF
 * pagination without hand-entering thirty items. Never rendered in a
 * production build — `import.meta.env.DEV` is statically false there, so the
 * whole component (and `demoData`) is dropped by the bundler.
 */
export function DevDataBar() {
  const { replaceData, resetAll } = useAppData();

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Dev only</span>
      <Button size="sm" onClick={() => replaceData(buildDemoData(12, 30))}>
        Load Demo Data (12 members)
      </Button>
      <Button size="sm" onClick={() => replaceData(buildDemoData(4, 12))}>
        Load Small Set (4 members)
      </Button>
      <Button size="sm" variant="danger" onClick={resetAll}>
        Reset
      </Button>
    </div>
  );
}
