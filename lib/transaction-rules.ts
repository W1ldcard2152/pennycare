import { prisma } from './db';

export interface RuleMatch {
  ruleId: string;
  targetAccountId: string;
  memo: string | null;
}

/**
 * Apply transaction rules to a list of transactions.
 * Returns a map of transaction index → match result.
 *
 * Rules are matched in order of:
 * 1. Priority (higher first)
 * 2. Creation date (older first)
 *
 * First matching rule wins.
 */
export async function applyRules(
  companyId: string,
  sourceAccountId: string,
  transactions: { description: string }[]
): Promise<Map<number, RuleMatch>> {
  // Load all active rules for the company
  const rules = await prisma.transactionRule.findMany({
    where: {
      companyId,
      isActive: true,
      OR: [
        { sourceAccountId: null }, // Global rules
        { sourceAccountId }, // Rules specific to this source account
      ],
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
  });

  const matches = new Map<number, RuleMatch>();

  for (let i = 0; i < transactions.length; i++) {
    const description = transactions[i].description.toLowerCase();

    for (const rule of rules) {
      const matchText = rule.matchText.toLowerCase();
      let isMatch = false;

      switch (rule.matchType) {
        case 'starts_with':
          isMatch = description.startsWith(matchText);
          break;
        case 'contains':
          isMatch = description.includes(matchText);
          break;
        case 'ends_with':
          isMatch = description.endsWith(matchText);
          break;
      }

      if (isMatch) {
        matches.set(i, {
          ruleId: rule.id,
          targetAccountId: rule.targetAccountId,
          memo: rule.defaultMemo,
        });
        break; // First match wins
      }
    }
  }

  return matches;
}

/**
 * Test a description against all rules and return matching rules.
 * Useful for the "Test Rule" feature in the UI.
 */
export async function testRules(
  companyId: string,
  description: string,
  sourceAccountId?: string | null
): Promise<Array<{
  ruleId: string;
  matchType: string;
  matchText: string;
  targetAccountId: string;
  targetAccountName: string;
  defaultMemo: string | null;
  priority: number;
}>> {
  const whereClause: Record<string, unknown> = {
    companyId,
    isActive: true,
  };

  if (sourceAccountId) {
    whereClause.OR = [
      { sourceAccountId: null },
      { sourceAccountId },
    ];
  } else {
    whereClause.sourceAccountId = null;
  }

  const rules = await prisma.transactionRule.findMany({
    where: whereClause,
    include: {
      targetAccount: {
        select: { name: true },
      },
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
  });

  const descLower = description.toLowerCase();
  const matches: Array<{
    ruleId: string;
    matchType: string;
    matchText: string;
    targetAccountId: string;
    targetAccountName: string;
    defaultMemo: string | null;
    priority: number;
  }> = [];

  for (const rule of rules) {
    const matchText = rule.matchText.toLowerCase();
    let isMatch = false;

    switch (rule.matchType) {
      case 'starts_with':
        isMatch = descLower.startsWith(matchText);
        break;
      case 'contains':
        isMatch = descLower.includes(matchText);
        break;
      case 'ends_with':
        isMatch = descLower.endsWith(matchText);
        break;
    }

    if (isMatch) {
      matches.push({
        ruleId: rule.id,
        matchType: rule.matchType,
        matchText: rule.matchText,
        targetAccountId: rule.targetAccountId,
        targetAccountName: rule.targetAccount.name,
        defaultMemo: rule.defaultMemo,
        priority: rule.priority,
      });
    }
  }

  return matches;
}
