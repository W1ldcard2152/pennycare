import { prisma } from '../lib/db';

async function investigate() {
  console.log('=== INVESTIGATION 1: Raw Journal Entry Dates (eBay Import) ===\n');

  const journalEntries = await prisma.journalEntry.findMany({
    where: { source: 'ebay_import' },
    orderBy: { date: 'asc' },
    take: 5,
    select: { id: true, date: true, memo: true }
  });

  for (const entry of journalEntries) {
    console.log(`ID: ${entry.id}`);
    console.log(`  Raw date object: ${entry.date}`);
    console.log(`  toISOString(): ${entry.date.toISOString()}`);
    console.log(`  Memo: ${entry.memo}`);
    console.log('');
  }

  console.log('\n=== INVESTIGATION 2: Raw eBay Sales Dates ===\n');

  const ebaySales = await prisma.ebaySale.findMany({
    orderBy: { orderDate: 'asc' },
    take: 5,
    select: { id: true, orderDate: true, orderNumber: true }
  });

  for (const sale of ebaySales) {
    console.log(`ID: ${sale.id}`);
    console.log(`  Raw orderDate: ${sale.orderDate}`);
    console.log(`  toISOString(): ${sale.orderDate.toISOString()}`);
    console.log(`  Order Number: ${sale.orderNumber}`);
    console.log('');
  }

  console.log('\n=== INVESTIGATION 5: Entry with "eBay sales for 2025-01-01" ===\n');

  const jan1Entry = await prisma.journalEntry.findFirst({
    where: {
      source: 'ebay_import',
      memo: { contains: '2025-01-01' }
    },
    select: { id: true, date: true, memo: true, entryNumber: true }
  });

  if (jan1Entry) {
    console.log(`Found entry for "2025-01-01":`);
    console.log(`  ID: ${jan1Entry.id}`);
    console.log(`  Entry Number: ${jan1Entry.entryNumber}`);
    console.log(`  Raw date: ${jan1Entry.date}`);
    console.log(`  toISOString(): ${jan1Entry.date.toISOString()}`);
    console.log(`  getUTCFullYear(): ${jan1Entry.date.getUTCFullYear()}`);
    console.log(`  getUTCMonth()+1: ${jan1Entry.date.getUTCMonth() + 1}`);
    console.log(`  getUTCDate(): ${jan1Entry.date.getUTCDate()}`);
    console.log(`  getFullYear() (local): ${jan1Entry.date.getFullYear()}`);
    console.log(`  getMonth()+1 (local): ${jan1Entry.date.getMonth() + 1}`);
    console.log(`  getDate() (local): ${jan1Entry.date.getDate()}`);
    console.log(`  Memo: ${jan1Entry.memo}`);
  } else {
    console.log('No entry found with memo containing "2025-01-01"');
  }

  console.log('\n=== INVESTIGATION: Last few January entries ===\n');

  const lastJanEntries = await prisma.journalEntry.findMany({
    where: {
      source: 'ebay_import',
      memo: { contains: '2025-01' }
    },
    orderBy: { date: 'desc' },
    take: 5,
    select: { id: true, date: true, memo: true }
  });

  for (const entry of lastJanEntries) {
    console.log(`Memo: ${entry.memo}`);
    console.log(`  toISOString(): ${entry.date.toISOString()}`);
    console.log(`  UTC Date: ${entry.date.getUTCFullYear()}-${String(entry.date.getUTCMonth()+1).padStart(2,'0')}-${String(entry.date.getUTCDate()).padStart(2,'0')}`);
    console.log('');
  }

  await prisma.$disconnect();
}

investigate().catch(console.error);
