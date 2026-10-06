#!/usr/bin/env node
/**
 * Architecture invariant lint (runs as part of `npm test`).
 *
 * Invariant: ALL JournalEntry / JournalEntryLine mutations go through
 * lib/journal-entry-service.ts. No route handler or other lib module may call
 * prisma.journalEntry.{create,update,delete,updateMany,deleteMany,upsert} or
 * the equivalent journalEntryLine writes directly — bypassing the service
 * skips the state machine, closed-period/reconciled guards, SoD, and tier-1
 * audit. See CLAUDE.md "Journal entry service" for the rationale.
 *
 * Caught, on any client identifier and across line breaks:
 *   - direct model writes      x.journalEntry.update(...), t\n  .journalEntryLine\n  .create(...)
 *   - nested relation writes   taxDeposit.create({ data: { journalEntry: { create: ... } } })
 *   - raw SQL writes           $executeRaw`UPDATE "JournalEntry" ...`
 *
 * Allowed locations:
 *   - lib/journal-entry-service.ts  (the service itself)
 *   - scripts/                       (one-off migrations/repairs)
 *
 * Exits non-zero (failing CI) if a violation is found. `findViolations` is
 * exported so __tests__/lintInvariants.test.ts can pin what the patterns catch.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_DIRS = ['app', 'lib'];
const ALLOWED = new Set(['lib/journal-entry-service.ts']);

const WRITE_METHODS = 'create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany';

const PATTERNS = [
  // <anything>.journalEntry(Line).<write> — also <anything>['journalEntry'].<write>
  new RegExp(
    String.raw`(?:\.\s*|\[\s*['"])journalEntry(?:Line)?(?:['"]\s*\])?\s*\.\s*(?:${WRITE_METHODS})\b`,
    'g'
  ),
  // Nested relation write from another model's create/update
  new RegExp(
    String.raw`\bjournalEntr(?:y|ies|yLines?)\s*:\s*\{\s*(?:${WRITE_METHODS}|connectOrCreate)\b`,
    'g'
  ),
  // Raw SQL against the tables
  /\b(?:UPDATE|INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM)\s+["`]?JournalEntry(?:Line)?\b/gi,
];

/** Return `{ line, text }` for every JE write in `source` (1-indexed lines). */
export function findViolations(source) {
  const hits = new Map();
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      if (!hits.has(line)) {
        hits.set(line, source.split('\n')[line - 1].trim());
      }
    }
  }
  return [...hits].sort((a, b) => a[0] - b[0]).map(([line, text]) => ({ line, text }));
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const violations = [];
  for (const scanDir of SCAN_DIRS) {
    for (const file of walk(join(root, scanDir))) {
      const relPosix = relative(root, file).replaceAll('\\', '/');
      if (ALLOWED.has(relPosix)) continue;
      for (const { line, text } of findViolations(readFileSync(file, 'utf8'))) {
        violations.push(`${relPosix}:${line}: ${text}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('JE-write invariant violated — these journalEntry/journalEntryLine writes');
    console.error('must go through lib/journal-entry-service.ts:\n');
    for (const v of violations) console.error('  ' + v);
    console.error(`\n${violations.length} violation(s). See CLAUDE.md "Journal entry service".`);
    process.exit(1);
  }

  console.log('JE-write invariant OK: all journalEntry writes go through the service.');
}

// Run only when invoked as a script, not when imported by the test.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
