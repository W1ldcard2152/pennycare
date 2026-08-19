import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * SQLite concurrency configuration.
 *
 * - connection_limit=1 pins Prisma to a single connection so the per-connection
 *   busy_timeout pragma below applies to every query, and concurrent writes
 *   queue in-process instead of failing with SQLITE_BUSY.
 * - journal_mode=WAL is persistent (stored in the DB file itself) and lets
 *   readers proceed while a write is in flight. The wal_checkpoint(TRUNCATE)
 *   calls in the backup runner and clear-all-data depend on WAL being active.
 * - busy_timeout=5000 makes any access from a second connection/process wait
 *   up to 5s for a lock instead of erroring immediately.
 */
function buildDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith('file:') || url.includes('connection_limit=')) {
    return url;
  }
  return url + (url.includes('?') ? '&' : '?') + 'connection_limit=1';
}

function createClient(): PrismaClient {
  const client = new PrismaClient({ datasourceUrl: buildDatasourceUrl() });
  // Fire-and-forget: WAL persists in the file after the first run, and a query
  // racing ahead of busy_timeout just gets today's (pre-1.2) behavior once.
  client
    .$queryRawUnsafe('PRAGMA journal_mode=WAL;')
    .then(() => client.$queryRawUnsafe('PRAGMA busy_timeout=5000;'))
    .catch((error) => console.error('Failed to set SQLite pragmas:', error));
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
