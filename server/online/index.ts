import { startVytheraOnlineServer } from './app';

const entry = process.argv[1] ?? '';
if (entry.includes('online') && (entry.endsWith('index.ts') || entry.endsWith('index.js') || entry.endsWith('app.ts'))) {
  startVytheraOnlineServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { startVytheraOnlineServer, loadOnlineConfig } from './app';
