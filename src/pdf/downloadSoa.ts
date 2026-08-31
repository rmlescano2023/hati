import { createElement, type ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { todayIso } from '../lib/format';
import type { PurchaseRecord } from '../types';

type Args = {
  members: string[];
  records: PurchaseRecord[];
};

/**
 * Build the SOA and hand it to the browser as a real file download.
 *
 * The PDF is rendered by `@react-pdf/renderer` into a Blob and clicked through
 * a temporary `<a download>` — there is no `window.print()` anywhere, which is
 * what used to produce the "about:blank" header/timestamp artifacts.
 *
 * The renderer is imported dynamically so its ~1MB of code never lands in the
 * initial page bundle.
 */
export async function downloadSoa({ members, records }: Args): Promise<void> {
  const [{ pdf }, { registerPdfFonts }, { SoaDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./fonts'),
    import('./SoaDocument'),
  ]);

  registerPdfFonts();

  // `pdf()` is typed against the raw <Document> element; our wrapper component
  // renders one, which the type parameter cannot express.
  const element = createElement(SoaDocument, {
    members,
    records,
  }) as unknown as ReactElement<DocumentProps>;

  const blob = await pdf(element).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Hati-SOA-${todayIso()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
