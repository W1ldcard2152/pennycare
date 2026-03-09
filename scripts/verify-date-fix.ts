/**
 * Verification script to confirm date display fix is working correctly.
 */

import { prisma } from '../lib/db';

async function verify() {
  console.log('=== Verification: Date Display Fix ===\n');

  // 1. Check that the entry for Jan 1 now shows correct dates
  console.log('1. Checking journal entry for "eBay sales for 2025-01-01":\n');

  const jan1Entry = await prisma.journalEntry.findFirst({
    where: {
      source: 'ebay_import',
      memo: { contains: '2025-01-01' }
    },
    select: { id: true, date: true, memo: true }
  });

  if (jan1Entry) {
    const d = jan1Entry.date;
    console.log(`  Memo: ${jan1Entry.memo}`);
    console.log(`  Stored date (ISO): ${d.toISOString()}`);
    console.log(`  UTC Date: ${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`);
    console.log(`  Local Date: ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    console.log(`  Display (with timeZone: UTC): ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}`);
    console.log(`  Display (without timeZone): ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`);

    // Check if both match
    const utcDate = d.getUTCDate();
    const localDate = d.getDate();
    const utcMonth = d.getUTCMonth();
    const localMonth = d.getMonth();

    if (utcDate === localDate && utcMonth === localMonth) {
      console.log('\n  ✅ PASS: UTC and local dates match! No more day shift.');
    } else {
      console.log('\n  ⚠️  WARNING: UTC and local dates still differ.');
    }
  }

  // 2. Check Jan 31 entry
  console.log('\n\n2. Checking journal entry for "eBay sales for 2025-01-31":\n');

  const jan31Entry = await prisma.journalEntry.findFirst({
    where: {
      source: 'ebay_import',
      memo: { contains: '2025-01-31' }
    },
    select: { id: true, date: true, memo: true }
  });

  if (jan31Entry) {
    const d = jan31Entry.date;
    console.log(`  Memo: ${jan31Entry.memo}`);
    console.log(`  Stored date (ISO): ${d.toISOString()}`);
    console.log(`  Display (with timeZone: UTC): ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}`);

    if (d.getUTCDate() === 31) {
      console.log('\n  ✅ PASS: Jan 31 shows as Jan 31!');
    } else {
      console.log('\n  ⚠️  WARNING: Jan 31 entry date mismatch.');
    }
  }

  // 3. Count entries by UTC date in January
  console.log('\n\n3. Counting eBay journal entries by UTC date in January 2025:\n');

  const janEntries = await prisma.journalEntry.findMany({
    where: {
      source: 'ebay_import',
      memo: { contains: '2025-01' }
    },
    select: { date: true, memo: true }
  });

  const dateSet = new Set<string>();
  for (const entry of janEntries) {
    const utcDate = `${entry.date.getUTCFullYear()}-${String(entry.date.getUTCMonth()+1).padStart(2,'0')}-${String(entry.date.getUTCDate()).padStart(2,'0')}`;
    dateSet.add(utcDate);
  }

  const sortedDates = Array.from(dateSet).sort();
  console.log(`  Total unique dates: ${sortedDates.length}`);
  console.log(`  Date range: ${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}`);

  if (sortedDates[0] === '2025-01-01' && sortedDates[sortedDates.length - 1] === '2025-01-31') {
    console.log('\n  ✅ PASS: Date range is Jan 1 to Jan 31 as expected!');
  } else {
    console.log('\n  ⚠️  WARNING: Date range does not match expected Jan 1-31.');
  }

  // 4. Simulate the query that runs on Account Detail page
  console.log('\n\n4. Simulating Account Detail query for Jan 1-31, 2025:\n');

  const startOfDay = new Date('2025-01-01T00:00:00.000Z');
  const endOfDay = new Date('2025-01-31T23:59:59.999Z');

  const entriesInRange = await prisma.journalEntry.findMany({
    where: {
      source: 'ebay_import',
      date: {
        gte: startOfDay,
        lte: endOfDay,
      }
    },
    orderBy: { date: 'asc' },
    select: { date: true, memo: true }
  });

  console.log(`  Query: date >= ${startOfDay.toISOString()}`);
  console.log(`         date <= ${endOfDay.toISOString()}`);
  console.log(`  Results: ${entriesInRange.length} entries`);

  if (entriesInRange.length > 0) {
    const firstDate = entriesInRange[0].date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    const lastDate = entriesInRange[entriesInRange.length - 1].date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    console.log(`  First entry display: ${firstDate}`);
    console.log(`  Last entry display: ${lastDate}`);

    if (firstDate.includes('Jan 1') && lastDate.includes('Jan 31')) {
      console.log('\n  ✅ PASS: Query returns Jan 1 to Jan 31 correctly!');
    }
  }

  console.log('\n=== Verification Complete ===');

  await prisma.$disconnect();
}

verify().catch(console.error);
