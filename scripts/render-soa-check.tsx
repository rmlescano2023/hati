/**
 * Dev-only harness: renders the SOA to /tmp with a large demo data set so the
 * pagination behaviour can be inspected without hand-entering data.
 * Run with:  npx vite-node scripts/render-soa-check.tsx
 */
import { createElement } from 'react';
import { Font, renderToFile } from '@react-pdf/renderer';
import { resolve } from 'node:path';
import { SoaDocument } from '../src/pdf/SoaDocument';
import { buildDemoData } from '../src/lib/demoData';

const fontDir = resolve(process.cwd(), 'public/fonts');

Font.register({
  family: 'DM Sans',
  fonts: [
    { src: resolve(fontDir, 'DMSans-Regular.ttf'), fontWeight: 400 },
    { src: resolve(fontDir, 'DMSans-Medium.ttf'), fontWeight: 500 },
    { src: resolve(fontDir, 'DMSans-Bold.ttf'), fontWeight: 700 },
  ],
});
Font.register({
  family: 'DM Mono',
  fonts: [
    { src: resolve(fontDir, 'DMMono-Regular.ttf'), fontWeight: 400 },
    { src: resolve(fontDir, 'DMMono-Medium.ttf'), fontWeight: 500 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const memberCount = Number(process.argv[2] ?? 12);
const itemCount = Number(process.argv[3] ?? 30);
const out = process.argv[4] ?? '/tmp/hati-soa-check.pdf';

const data = buildDemoData(memberCount, itemCount);

await renderToFile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createElement(SoaDocument, { members: data.members, records: data.records }) as any,
  out,
);

console.log(
  `rendered ${out} — ${data.members.length} members, ${data.records.length} records, ` +
    `${data.records.reduce((a, r) => a + r.items.length, 0)} items`,
);
