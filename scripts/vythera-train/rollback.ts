import { rollbackTo, getActiveAdapter } from './promote.ts';

const idx = process.argv.indexOf('--to');
const target = idx >= 0 ? process.argv[idx + 1] : null;
if (!target) {
  console.log('Active:', getActiveAdapter());
  console.error('Usage: tsx rollback.ts --to <adapter-dir-or-name>');
  process.exit(1);
}
const r = rollbackTo(target);
console.log(JSON.stringify(r, null, 2));
process.exit(r.ok ? 0 : 1);
