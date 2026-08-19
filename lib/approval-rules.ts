import type { Role } from './api-utils';
import { ROLE_LEVEL } from './api-utils';

/**
 * Approval matrix engine for MANUAL journal entries in 'team' approval mode.
 *
 * Semantics (ratified):
 *  - Only active rules participate.
 *  - A rule matches when ALL of its conditions hold for the entry.
 *  - Every matching rule must be satisfied, so the STRICTEST required role
 *    among the matches wins.
 *  - If NO rule matches, the engine default-denies: required role escalates
 *    to OWNER.
 *  - Malformed conditions (bad JSON, unknown keys, wrong types) make a rule
 *    non-matching — failing closed toward the OWNER default rather than
 *    silently relaxing the requirement. Such rules are reported in warnings.
 *
 * Condition schema (conditions column, JSON string):
 *   { "minAmount": 500000 }        — entry total (cents) >= 500000 ($5,000)
 *   { "maxAmount": 100000 }        — entry total (cents) <= 100000
 *   { "source": "manual" }         — entry source equals (future use; no such
 *                                    rule ships in 1.2)
 * Amounts are integer cents. An empty object {} matches every entry.
 */

export interface ApprovalRuleLike {
  id: string;
  priority: number;
  conditions: string;
  requiredRole: string;
  active: boolean;
}

export interface EntryFacts {
  /** Entry total = sum of debit lines, in integer cents. */
  totalCents: number;
  source: string;
}

export interface ApprovalEvaluation {
  /** Role required to approve this entry. */
  requiredRole: Role;
  /** Rules that matched, ordered by priority desc then strictness desc. */
  matchedRuleIds: string[];
  /** True when no rule matched and the OWNER default-deny applied. */
  defaultDeny: boolean;
  /** Rules skipped for malformed conditions or unknown requiredRole. */
  warnings: string[];
}

const KNOWN_CONDITION_KEYS = new Set(['minAmount', 'maxAmount', 'source']);

function parseConditions(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function ruleMatches(
  conditions: Record<string, unknown>,
  entry: EntryFacts
): boolean | 'malformed' {
  for (const key of Object.keys(conditions)) {
    if (!KNOWN_CONDITION_KEYS.has(key)) return 'malformed';
  }
  if ('minAmount' in conditions) {
    const min = conditions.minAmount;
    if (typeof min !== 'number' || !Number.isInteger(min)) return 'malformed';
    if (entry.totalCents < min) return false;
  }
  if ('maxAmount' in conditions) {
    const max = conditions.maxAmount;
    if (typeof max !== 'number' || !Number.isInteger(max)) return 'malformed';
    if (entry.totalCents > max) return false;
  }
  if ('source' in conditions) {
    const source = conditions.source;
    if (typeof source !== 'string') return 'malformed';
    if (entry.source !== source) return false;
  }
  return true;
}

export function evaluateApprovalRules(
  rules: ApprovalRuleLike[],
  entry: EntryFacts
): ApprovalEvaluation {
  const warnings: string[] = [];
  const matched: ApprovalRuleLike[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;

    if (!(rule.requiredRole in ROLE_LEVEL)) {
      warnings.push(`Rule ${rule.id}: unknown requiredRole '${rule.requiredRole}' — skipped`);
      continue;
    }

    const conditions = parseConditions(rule.conditions);
    if (conditions === null) {
      warnings.push(`Rule ${rule.id}: malformed conditions JSON — skipped (fails closed)`);
      continue;
    }

    const result = ruleMatches(conditions, entry);
    if (result === 'malformed') {
      warnings.push(`Rule ${rule.id}: unknown or mistyped condition — skipped (fails closed)`);
      continue;
    }
    if (result) matched.push(rule);
  }

  if (matched.length === 0) {
    return { requiredRole: 'OWNER', matchedRuleIds: [], defaultDeny: true, warnings };
  }

  // All matching rules must be satisfied → the strictest wins. Priority only
  // orders the report; it cannot relax the requirement.
  matched.sort(
    (a, b) =>
      b.priority - a.priority ||
      ROLE_LEVEL[b.requiredRole as Role] - ROLE_LEVEL[a.requiredRole as Role]
  );
  const strictest = matched.reduce<Role>(
    (acc, rule) =>
      ROLE_LEVEL[rule.requiredRole as Role] > ROLE_LEVEL[acc] ? (rule.requiredRole as Role) : acc,
    matched[0].requiredRole as Role
  );

  return {
    requiredRole: strictest,
    matchedRuleIds: matched.map((r) => r.id),
    defaultDeny: false,
    warnings,
  };
}
