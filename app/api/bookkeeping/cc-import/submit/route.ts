import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createJournalEntry } from '@/lib/bookkeeping';
import { applyRules } from '@/lib/transaction-rules';
import { parseBusinessDate, formatDate } from '@/lib/date-utils';

interface SubmitPayment {
  date: string;
  description: string;
  amount: number;
}

interface SubmitCredit {
  date: string;
  description: string;
  amount: number;
  targetAccountId?: string | null;
}

interface SubmitTransaction {
  date: string;
  description: string;
  amount: number;
  isCredit: boolean;
  targetAccountId?: string | null;
}

// POST /api/bookkeeping/cc-import/submit
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json();
    const {
      sourceAccountId,
      format,
      statementEndDate,
      batchName,
      interestAmount,
      interestAccountId,
      payments,
      credits,
      transactions,
    } = body as {
      sourceAccountId: string;
      format: string;
      statementEndDate: string;
      batchName: string;
      interestAmount: number;
      interestAccountId: string;
      payments: SubmitPayment[];
      credits: SubmitCredit[];
      transactions: SubmitTransaction[];
    };

    // Validate required fields
    if (!sourceAccountId) {
      return NextResponse.json({ error: 'Source account ID is required' }, { status: 400 });
    }
    if (!batchName) {
      return NextResponse.json({ error: 'Batch name is required' }, { status: 400 });
    }
    if (!statementEndDate) {
      return NextResponse.json({ error: 'Statement end date is required' }, { status: 400 });
    }

    // Verify the source account exists and belongs to this company
    const sourceAccount = await prisma.account.findFirst({
      where: { id: sourceAccountId, companyId: companyId! },
    });
    if (!sourceAccount) {
      return NextResponse.json({ error: 'Source account not found' }, { status: 404 });
    }
    const isCreditCard = sourceAccount.type === 'credit_card';
    const isBankAccount = sourceAccount.type === 'asset' && sourceAccount.accountGroup === 'Cash';
    if (!isCreditCard && !isBankAccount) {
      return NextResponse.json({ error: 'Source account must be a credit card or bank account' }, { status: 400 });
    }

    // Find the CC Payments Pending account (code 1060)
    const clearingAccount = await prisma.account.findUnique({
      where: { companyId_code: { companyId: companyId!, code: '1060' } },
    });
    if (!clearingAccount) {
      return NextResponse.json(
        { error: 'CC Payments Pending account (1060) not found. Please seed the chart of accounts.' },
        { status: 400 }
      );
    }

    // Use parseBusinessDate for timezone-safe date creation (noon UTC)
    const endDate = parseBusinessDate(statementEndDate);
    let interestBooked = false;
    let paymentsBooked = 0;
    let transactionsMatched = 0;
    let transactionsUnmatched = 0;

    // 1. Book interest journal entry if amount > 0
    if (interestAmount && interestAmount > 0) {
      if (!interestAccountId) {
        return NextResponse.json(
          { error: 'Interest account is required when interest amount > 0' },
          { status: 400 }
        );
      }

      // Verify interest account exists
      const interestAccount = await prisma.account.findFirst({
        where: { id: interestAccountId, companyId: companyId! },
      });
      if (!interestAccount) {
        return NextResponse.json({ error: 'Interest account not found' }, { status: 404 });
      }

      // Create interest journal entry: DEBIT interest expense, CREDIT credit card
      await createJournalEntry({
        companyId: companyId!,
        date: endDate,
        memo: `Credit card interest - ${sourceAccount.name}`,
        source: 'cc_import',
        referenceNumber: batchName,  // Link to batch for deletion
        lines: [
          {
            accountId: interestAccountId,
            description: 'Credit card interest',
            debit: interestAmount,
            credit: 0,
          },
          {
            accountId: sourceAccountId,
            description: 'Credit card interest',
            debit: 0,
            credit: interestAmount,
          },
        ],
      });
      interestBooked = true;
    }

    // 2. Book payment journal entries (immediate, no staging)
    // Each payment: DEBIT credit card (reduces CC balance), CREDIT CC Payments Pending
    if (payments && payments.length > 0) {
      for (const payment of payments) {
        // Use parseBusinessDate for timezone-safe date creation (noon UTC)
        const paymentDate = parseBusinessDate(payment.date);
        await createJournalEntry({
          companyId: companyId!,
          date: paymentDate,
          memo: payment.description,
          source: 'cc_import',
          referenceNumber: batchName,  // Link to batch for deletion
          lines: [
            {
              accountId: sourceAccountId,
              description: payment.description,
              debit: payment.amount,
              credit: 0,
            },
            {
              accountId: clearingAccount.id,
              description: payment.description,
              debit: 0,
              credit: payment.amount,
            },
          ],
        });
        paymentsBooked++;
      }
    }

    // 3. Process credits (returns, cash back, etc.) - treat like transactions
    // Credits reduce the CC balance: DEBIT CC, CREDIT target account
    let creditsMatched = 0;
    let creditsUnmatched = 0;
    let creditsDuplicatesSkipped = 0;

    if (credits && credits.length > 0) {
      // Check for duplicates
      const existingCredits = await prisma.statementImport.findMany({
        where: {
          companyId: companyId!,
          sourceAccountId,
        },
        select: {
          postDate: true,
          description: true,
          amount: true,
          isDebit: true,
        },
      });

      // Use formatDate for duplicate detection to compare calendar dates consistently
      const existingCreditSet = new Set(
        existingCredits.map((imp) =>
          `${formatDate(imp.postDate)}|${imp.description}|${imp.amount}|${imp.isDebit}`
        )
      );

      // Filter out duplicates
      const newCredits: typeof credits = [];
      for (const credit of credits) {
        const postDate = parseBusinessDate(credit.date);
        const isDebit = false; // Credits are always isDebit=false
        const key = `${formatDate(postDate)}|${credit.description}|${credit.amount}|${isDebit}`;
        if (existingCreditSet.has(key)) {
          creditsDuplicatesSkipped++;
        } else {
          newCredits.push(credit);
          existingCreditSet.add(key);
        }
      }

      if (newCredits.length > 0) {
        // Apply rules to credits
        const creditRuleMatches = await applyRules(
          companyId!,
          sourceAccountId,
          newCredits.map(c => ({ description: c.description }))
        );

        // Create StatementImport records for credits
        const creditImportRecords = newCredits.map((credit, index) => {
          const match = creditRuleMatches.get(index);
          const hasManualTarget = credit.targetAccountId && credit.targetAccountId.length > 0;
          const targetAccountId = hasManualTarget ? credit.targetAccountId : (match?.targetAccountId || null);

          if (targetAccountId) {
            creditsMatched++;
          } else {
            creditsUnmatched++;
          }

          return {
            companyId: companyId!,
            sourceAccountId,
            postDate: parseBusinessDate(credit.date),  // Timezone-safe
            description: credit.description,
            amount: credit.amount,
            isDebit: false,  // Credits always reduce CC balance
            targetAccountId: targetAccountId || null,
            matchedRuleId: match?.ruleId || null,
            memo: match?.memo || null,
            status: 'pending',
            importBatch: batchName,
          };
        });

        await prisma.statementImport.createMany({
          data: creditImportRecords,
        });
      }
    }

    // 4. Process transactions - apply rules and create StatementImport records
    let duplicatesSkipped = 0;

    if (transactions && transactions.length > 0) {
      // Check for duplicates (same pattern as bank statement upload)
      const existingImports = await prisma.statementImport.findMany({
        where: {
          companyId: companyId!,
          sourceAccountId,
        },
        select: {
          postDate: true,
          description: true,
          amount: true,
          isDebit: true,
        },
      });

      // Use formatDate for duplicate detection to compare calendar dates consistently
      const existingSet = new Set(
        existingImports.map((imp) =>
          `${formatDate(imp.postDate)}|${imp.description}|${imp.amount}|${imp.isDebit}`
        )
      );

      // Filter out duplicates
      const newTransactions: typeof transactions = [];
      for (const txn of transactions) {
        const postDate = parseBusinessDate(txn.date);
        const isDebit = !txn.isCredit;
        const key = `${formatDate(postDate)}|${txn.description}|${txn.amount}|${isDebit}`;
        if (existingSet.has(key)) {
          duplicatesSkipped++;
        } else {
          newTransactions.push(txn);
          existingSet.add(key); // Also prevent duplicates within the same upload
        }
      }

      // If all transactions are duplicates, return early with success
      if (newTransactions.length === 0) {
        return NextResponse.json({
          success: true,
          interestBooked,
          paymentsBooked,
          transactionsMatched: 0,
          transactionsUnmatched: 0,
          duplicatesSkipped,
          batchName,
          message: 'All transactions already imported',
        });
      }

      // Apply rules to find matches (only for new transactions)
      const ruleMatches = await applyRules(
        companyId!,
        sourceAccountId,
        newTransactions.map(t => ({ description: t.description }))
      );

      // Create StatementImport records (only for new transactions)
      const importRecords = newTransactions.map((txn, index) => {
        const match = ruleMatches.get(index);
        const hasManualTarget = txn.targetAccountId && txn.targetAccountId.length > 0;
        const targetAccountId = hasManualTarget ? txn.targetAccountId : (match?.targetAccountId || null);

        if (targetAccountId) {
          transactionsMatched++;
        } else {
          transactionsUnmatched++;
        }

        return {
          companyId: companyId!,
          sourceAccountId,
          postDate: parseBusinessDate(txn.date),  // Timezone-safe
          description: txn.description,
          amount: txn.amount,
          isDebit: !txn.isCredit,  // CC charge = isDebit true, CC credit/return = isDebit false
          targetAccountId: targetAccountId || null,
          matchedRuleId: match?.ruleId || null,
          memo: match?.memo || null,
          status: 'pending',
          importBatch: batchName,
        };
      });

      // Create all import records (all stay as 'pending' - user will review and book later)
      await prisma.statementImport.createMany({
        data: importRecords,
      });
    }

    // Log audit entry
    await prisma.auditLog.create({
      data: {
        userId: session!.userId,
        companyId: companyId!,
        action: 'CC_IMPORT',
        entityType: 'StatementImport',
        entityId: batchName,
        metadata: JSON.stringify({
          format,
          sourceAccountId,
          sourceAccountName: sourceAccount.name,
          batchName,
          interestBooked,
          interestAmount: interestAmount || 0,
          paymentsBooked,
          creditsMatched,
          creditsUnmatched,
          transactionsMatched,
          transactionsUnmatched,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      interestBooked,
      paymentsBooked,
      creditsMatched,
      creditsUnmatched,
      transactionsMatched,
      transactionsUnmatched,
      duplicatesSkipped: duplicatesSkipped + creditsDuplicatesSkipped,
      batchName,
    });
  } catch (err) {
    console.error('Error submitting CC import:', err);
    const message = err instanceof Error ? err.message : 'Failed to submit CC import';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
