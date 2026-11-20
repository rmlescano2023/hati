import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QrCode } from './QrCode';
import { encodeQr, qrPath } from '../../lib/qr';
import { QR_GOLDEN } from '../../lib/qr.fixtures';

// The golden 84-byte link: version 5, so a 37-module symbol and a 45-unit viewBox with its border.
const text = QR_GOLDEN[2].text;

describe('QrCode (AC-30.1, AC-30.2, BR-Q1, BR-Q3)', () => {
  const markup = renderToStaticMarkup(
    createElement(QrCode, { text, label: 'QR code for the invite link to Bali Trip' }),
  );

  it('is a labelled picture of exactly the text it was given', () => {
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="QR code for the invite link to Bali Trip"');
    expect(markup).toContain('viewBox="0 0 45 45"');
    expect(markup).toContain('shape-rendering="crispEdges"');
    expect(markup).toContain('fill="#000"');
    expect(markup).toContain(`d="${qrPath(encodeQr(text))}"`);
  });

  it('is dark on white with literal colours, in every theme', () => {
    const css = readFileSync(resolve(__dirname, './QrCode.module.css'), 'utf8');
    const rule = css.match(/\.qr\s*{[^}]*}/)?.[0] ?? '';
    expect(rule).toContain('background: #fff');
    expect(rule).toContain('forced-color-adjust: none');
    // Only the radius may come from a token; no colour does.
    for (const declaration of rule.match(/[\w-]*(?:background|color)[\w-]*:[^;]*/g) ?? []) {
      expect(declaration).not.toContain('var(');
    }
    expect(css).not.toContain('prefers-color-scheme');
  });
});
