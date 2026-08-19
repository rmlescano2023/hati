import { Font } from '@react-pdf/renderer';

const base = import.meta.env.BASE_URL || '/';
const url = (file: string) => `${base}fonts/${file}`;

let registered = false;

/**
 * Register the self-hosted DM Sans / DM Mono faces once.
 * The .ttf files live in `public/fonts/` — CDN font URLs are unreliable at
 * PDF-build time, so nothing here reaches outside the deployed origin.
 */
export function registerPdfFonts(): void {
  if (registered) return;

  Font.register({
    family: 'DM Sans',
    fonts: [
      { src: url('DMSans-Regular.ttf'), fontWeight: 400 },
      { src: url('DMSans-Medium.ttf'), fontWeight: 500 },
      { src: url('DMSans-Bold.ttf'), fontWeight: 700 },
    ],
  });

  Font.register({
    family: 'DM Mono',
    fonts: [
      { src: url('DMMono-Regular.ttf'), fontWeight: 400 },
      { src: url('DMMono-Medium.ttf'), fontWeight: 500 },
    ],
  });

  // Names and amounts should never be hyphenated mid-word inside a cell.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
