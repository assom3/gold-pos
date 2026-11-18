import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { startPriceScheduler, stopPriceScheduler } from './lib/price-scheduler.js';
import { startBackupScheduler, stopBackupScheduler } from './lib/backup.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  console.log(`\n  ⚜  Gold API شغال على http://localhost:${config.PORT}`);
  console.log(`     البيئة: ${config.NODE_ENV}`);
  console.log(`     العملة المحلية: ${config.LOCAL_CURRENCY}\n`);
  startPriceScheduler();
  void startBackupScheduler();
});

async function shutdown(signal: string) {
  console.log(`\n${signal} — إغلاق...`);
  stopPriceScheduler();
  stopBackupScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
