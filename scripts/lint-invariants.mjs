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
 * Allowed locations:
 *   - lib/journal-entry-service.ts  (the service itself)
 *   - scripts/                       (one-off migrations/repairs)
 *
 * Exits non-zero (failing CI) if a violation is found.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_DIRS = ['app', 'lib'];
const ALLOWED = new Set([
  'lib/journal-entry-service.ts',
].map((p) => p.replaceAll('/', '\\')).concat(['lib/journal-entry-service.ts']));

// prisma OR tx (any client identifier) . journalEntry(Line) . writeMethod
const VIOLATION = /\b(?:prisma|tx|db|client)\s*\.\s*journalEntry(?:Line)?\s*\.\s*(create|update|delete|updateMany|deleteMany|createMany|upsert)\b/;

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

const violations = [];
for (const scanDir of SCAN_DIRS) {
  const abs = join(root, scanDir);
  for (const file of walk(abs)) {
    const rel = relative(root, file);
    const relPosix = rel.replaceAll('\\', '/');
    if (relPosix === 'lib/journal-entry-service.ts') continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (VIOLATION.test(line)) {
        violations.push(`${relPosix}:${i + 1}: ${line.trim()}`);
      }
    });
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
