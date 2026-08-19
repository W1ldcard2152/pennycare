import { prisma } from '../lib/db';

(async () => {
  const total = await prisma.journalEntry.count();
  const byStatus = await prisma.journalEntry.groupBy({ by: ['status'], _count: true });
  const roles = await prisma.userCompanyAccess.groupBy({ by: ['role'], _count: true });
  const dupes = await prisma.journalEntry.groupBy({
    by: ['companyId', 'entryNumber'],
    having: { entryNumber: { _count: { gt: 1 } } },
    _count: true,
  });
  const nonPosted = await prisma.journalEntry.count({
    where: { status: { in: ['draft', 'pending_approval', 'rejected'] } },
  });
  let txTable = 'absent';
  try {
    await prisma.$queryRawUnsafe('SELECT 1 FROM "Transaction" LIMIT 1');
    txTable = 'PRESENT';
  } catch {
    txTable = 'absent';
  }
  console.log('Total JE rows:', total);
  console.log('By status:', JSON.stringify(byStatus.map((s) => ({ status: s.status, n: s._count }))));
  console.log('Roles:', JSON.stringify(roles.map((r) => ({ role: r.role, n: r._count }))));
  console.log('Duplicate (companyId,entryNumber) groups:', dupes.length);
  console.log('draft/pending/rejected rows (expect 0):', nonPosted);
  console.log('Legacy Transaction table:', txTable);
  await prisma.$disconnect();
})();
