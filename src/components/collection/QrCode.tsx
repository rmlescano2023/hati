import { useMemo } from 'react';
import { encodeQr, qrPath } from '../../lib/qr';
import styles from './QrCode.module.css';

type Props = {
  /** Exactly what the code encodes (BR-Q1). */
  text: string;
  /** Read out in place of the picture, as `aria-label`. */
  label: string;
};

/**
 * A QR code for `text`, as an inline SVG on a white tile. The quiet zone is inside the viewBox,
 * so the tile's white is the code's own border.
 */
export function QrCode({ text, label }: Props) {
  const matrix = useMemo(() => encodeQr(text), [text]);
  const size = matrix.length + 8;
  return (
    <svg
      className={styles.qr}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <path d={qrPath(matrix)} fill="#000" />
    </svg>
  );
}
