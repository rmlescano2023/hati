/**
 * `npm run dev` has to stay plain Vite, because `vercel dev` runs it to serve
 * the frontend — pointing it at `vercel dev` makes the CLI invoke itself. But
 * Vite alone does not serve `/api`, so the app cannot load any data, and the
 * failure it produces is a JSON parse error that names nothing useful.
 *
 * So it says so on the way past.
 */
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

console.log('');
console.log(`  ${bold('Vite only — /api is not served here.')}`);
console.log(dim('  Sign-in and your sessions will not load. For the whole app:'));
console.log(`  ${bold('npm run dev:full')}`);
console.log('');
