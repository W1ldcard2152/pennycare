import { describe, it, expect } from 'vitest';
import { evaluateApprovalRules, type ApprovalRuleLike } from '@/lib/approval-rules';

function rule(partial: Partial<ApprovalRuleLike>): ApprovalRuleLike {
  return {
    id: partial.id ?? 'r',
    priority: partial.priority ?? 0,
    conditions: partial.conditions ?? '{}',
    requiredRole: partial.requiredRole ?? 'APPROVER',
    active: partial.active ?? true,
  };
}

const entry = (totalCents: number, source = 'manual') => ({ totalCents, source });

describe('approval matrix engine', () => {
  it('default-denies to OWNER when no rule matches', () => {
    const result = evaluateApprovalRules([], entry(10000));
    expect(result.requiredRole).toBe('OWNER');
    expect(result.defaultDeny).toBe(true);
    expect(result.matchedRuleIds).toEqual([]);
  });

  it('matches an empty-condition rule against any entry', () => {
    const result = evaluateApprovalRules([rule({ conditions: '{}', requiredRole: 'BOOKKEEPER' })], entry(1));
    expect(result.requiredRole).toBe('BOOKKEEPER');
    expect(result.defaultDeny).toBe(false);
  });

  it('honors minAmount threshold (in cents)', () => {
    const rules = [rule({ id: 'big', conditions: JSON.stringify({ minAmount: 500000 }), requiredRole: 'OWNER' })];
    // Below threshold → no match → default-deny OWNER (coincidentally OWNER, but defaultDeny true)
    const below = evaluateApprovalRules(rules, entry(499999));
    expect(below.defaultDeny).toBe(true);
    // At/above threshold → matches
    const at = evaluateApprovalRules(rules, entry(500000));
    expect(at.requiredRole).toBe('OWNER');
    expect(at.defaultDeny).toBe(false);
    expect(at.matchedRuleIds).toEqual(['big']);
  });

  it('honors maxAmount threshold', () => {
    const rules = [rule({ conditions: JSON.stringify({ maxAmount: 10000 }), requiredRole: 'BOOKKEEPER' })];
    expect(evaluateApprovalRules(rules, entry(10000)).requiredRole).toBe('BOOKKEEPER');
    expect(evaluateApprovalRules(rules, entry(10001)).defaultDeny).toBe(true);
  });

  it('strictest required role wins when multiple rules match', () => {
    const rules = [
      rule({ id: 'a', conditions: '{}', requiredRole: 'BOOKKEEPER' }),
      rule({ id: 'b', conditions: '{}', requiredRole: 'APPROVER' }),
      rule({ id: 'c', conditions: JSON.stringify({ minAmount: 100 }), requiredRole: 'OWNER' }),
    ];
    const result = evaluateApprovalRules(rules, entry(200));
    expect(result.requiredRole).toBe('OWNER');
    expect(result.matchedRuleIds).toContain('c');
    expect(result.matchedRuleIds.length).toBe(3);
  });

  it('strictest still wins regardless of priority ordering', () => {
    const rules = [
      rule({ id: 'low', priority: 100, conditions: '{}', requiredRole: 'VIEWER' }),
      rule({ id: 'high', priority: 1, conditions: '{}', requiredRole: 'APPROVER' }),
    ];
    expect(evaluateApprovalRules(rules, entry(1)).requiredRole).toBe('APPROVER');
  });

  it('ignores inactive rules', () => {
    const rules = [rule({ id: 'off', active: false, conditions: '{}', requiredRole: 'OWNER' })];
    const result = evaluateApprovalRules(rules, entry(1));
    expect(result.defaultDeny).toBe(true); // the only rule is inactive → no match
  });

  it('supports the source condition (future-proofing)', () => {
    const rules = [rule({ conditions: JSON.stringify({ source: 'manual' }), requiredRole: 'APPROVER' })];
    expect(evaluateApprovalRules(rules, entry(1, 'manual')).requiredRole).toBe('APPROVER');
    expect(evaluateApprovalRules(rules, entry(1, 'payroll')).defaultDeny).toBe(true);
  });

  it('fails closed on malformed JSON (rule dropped, warning emitted)', () => {
    const rules = [rule({ id: 'bad', conditions: '{not json', requiredRole: 'BOOKKEEPER' })];
    const result = evaluateApprovalRules(rules, entry(1));
    expect(result.defaultDeny).toBe(true);
    expect(result.warnings.length).toBe(1);
  });

  it('fails closed on unknown condition keys', () => {
    const rules = [rule({ id: 'weird', conditions: JSON.stringify({ frobnicate: true }), requiredRole: 'BOOKKEEPER' })];
    const result = evaluateApprovalRules(rules, entry(1));
    expect(result.defaultDeny).toBe(true);
    expect(result.warnings.length).toBe(1);
  });

  it('fails closed on an unknown requiredRole', () => {
    const rules = [rule({ id: 'x', conditions: '{}', requiredRole: 'SUPERUSER' })];
    const result = evaluateApprovalRules(rules, entry(1));
    expect(result.defaultDeny).toBe(true);
    expect(result.warnings.length).toBe(1);
  });

  it('rejects non-integer amount conditions', () => {
    const rules = [rule({ conditions: JSON.stringify({ minAmount: 1.5 }), requiredRole: 'OWNER' })];
    const result = evaluateApprovalRules(rules, entry(100));
    expect(result.defaultDeny).toBe(true);
    expect(result.warnings.length).toBe(1);
  });
});
