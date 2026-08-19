// One-off check that lib/db.ts brings the connection up in WAL mode with a
// busy_timeout. Run with: npx tsx scripts/verify-wal.ts
import { prisma } from '../lib/db';

async function main() {
  // Give the fire-and-forget pragma init a beat to complete
  await new Promise((resolve) => setTimeout(resolve, 500));
  const mode = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode;');
  const timeout = await prisma.$queryRawUnsafe<Array<{ timeout: number | bigint }>>('PRAGMA busy_timeout;');
  const entries = await prisma.journalEntry.count();
  console.log('journal_mode =', mode[0]?.journal_mode);
  console.log('busy_timeout =', Number(timeout[0]?.timeout));
  console.log('journalEntry rows =', entries);
  if (mode[0]?.journal_mode !== 'wal') {
    console.error('FAIL: expected wal');
    process.exit(1);
  }
  if (Number(timeout[0]?.timeout) !== 5000) {
    console.error('FAIL: expected busy_timeout 5000');
    process.exit(1);
  }
  console.log('OK');
}

main().finally(() => prisma.$disconnect());
