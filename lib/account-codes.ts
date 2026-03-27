// Shared logic for auto-generating account codes based on existing accounts
// Updated to use accountGroup instead of subtype

import {
  ACCOUNT_GROUPS,
  GROUP_CODE_RANGES,
  ACCOUNT_TYPE_LABELS,
  isBankAccount,
  isCreditCardAccount,
  isReconcilableAccount,
  isCOGSAccount,
  getGroupDisplayOrder,
} from './default-chart-of-accounts';
import type { AccountType } from './default-chart-of-accounts';

export interface AccountForCodeSuggestion {
  code: string;
  type: string;
  accountGroup: string | null;
}

/**
 * Computes the next available code for each group based on existing accounts.
 * Returns a map of group name -> next suggested code string.
 *
 * IMPORTANT: This checks ALL existing codes to avoid duplicates across groups.
 */
export function computeSuggestedCodes(accountList: AccountForCodeSuggestion[]): Record<string, string> {
  const suggestions: Record<string, string> = {};

  // Build a set of ALL existing numeric codes for duplicate checking
  const existingCodes = new Set<number>();
  for (const acct of accountList) {
    const code = parseInt(acct.code, 10);
    if (!isNaN(code)) {
      existingCodes.add(code);
    }
  }

  // For each group, find the next available code
  for (const [groupName, range] of Object.entries(GROUP_CODE_RANGES)) {
    // Start at the range start
    let maxCodeInRange = range.start - range.increment;

    // Find the maximum existing code within this specific group's range
    for (const acct of accountList) {
      const code = parseInt(acct.code, 10);
      if (isNaN(code)) continue;

      // Check if account is in this group
      if (acct.accountGroup === groupName && code >= range.start && code <= range.end && code > maxCodeInRange) {
        maxCodeInRange = code;
      }
    }

    // Calculate the next code based on range max
    let suggestedCode = maxCodeInRange + range.increment;

    // Keep incrementing if the suggested code already exists (from any group)
    // Also check that we don't exceed the range end
    while (existingCodes.has(suggestedCode) && suggestedCode <= range.end) {
      suggestedCode += range.increment;
    }

    // If we exceeded the range, just use the next available number anyway
    // (the user will need to manually adjust or we extend the range)
    if (suggestedCode > range.end) {
      suggestedCode = range.end + range.increment;
      while (existingCodes.has(suggestedCode)) {
        suggestedCode += range.increment;
      }
    }

    suggestions[groupName] = String(suggestedCode);
  }

  return suggestions;
}

/**
 * Gets the suggested code for a specific account group.
 * @param suggestedCodes - The precomputed suggested codes from computeSuggestedCodes()
 * @param accountGroup - The account group name
 */
export function getSuggestedCode(
  suggestedCodes: Record<string, string>,
  accountGroup: string
): string {
  const range = GROUP_CODE_RANGES[accountGroup];
  return suggestedCodes[accountGroup] || String(range?.start || '');
}

/**
 * Gets the suggested code for a type when no group is selected yet.
 * Returns the code for the first group of that type.
 */
export function getSuggestedCodeForType(
  suggestedCodes: Record<string, string>,
  type: AccountType
): string {
  const groups = ACCOUNT_GROUPS[type];
  if (groups && groups.length > 0) {
    return getSuggestedCode(suggestedCodes, groups[0]);
  }
  return '';
}

// Re-export for convenience
export {
  ACCOUNT_GROUPS,
  GROUP_CODE_RANGES,
  ACCOUNT_TYPE_LABELS,
  isBankAccount,
  isCreditCardAccount,
  isReconcilableAccount,
  isCOGSAccount,
  getGroupDisplayOrder,
} from './default-chart-of-accounts';
export type { AccountType };
