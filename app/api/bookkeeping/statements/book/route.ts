import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { bookTransactionsSchema, validateRequest } from '@/lib/validation';
import { createJournalEntry, isDebitNormal } from '@/lib/bookkeeping';

// POST /api/bookkeeping/statements/book
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(bookTransactionsSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    // Get the IDs to book
    let ids: string[];
    if ('ids' in validation.data) {
      ids = validation.data.ids;
    } else {
      // Book all matched transactions in a batch
      const matched = await prisma.statementImport.findMany({
        where: {
          companyId: companyId!,
          importBatch: validation.data.batchName,
          status: 'pending',
          targetAccountId: { not: null },
        },
        select: { id: true },
      });
      ids = matched.map((m) => m.id);
    }

    if (ids.length === 0) {
      return NextResponse.json({ booked: 0, journalEntriesCreated: 0 });
    }

    // Load all the statement imports to book
    const imports = await prisma.statementImport.findMany({
      where: {
        id: { in: ids },
        companyId: companyId!,
        status: 'pending',
      },
      include: {
        sourceAccount: true,
        targetAccount: true,
      },
    });

    // Verify all have a target account
    const missingTarget = imports.filter((imp) => !imp.targetAccountId);
    if (missingTarget.length > 0) {
      return NextResponse.json(
        {
          error: 'Some transactions are missing a target account',
          missingCount: missingTarget.length,
          missingIds: missingTarget.map((m) => m.id),
        },
        { status: 400 }
      );
    }

    // Create journal entries for each transaction (one per transaction)
    // Note: createJournalEntry has its own internal transaction, so we create entries first,
    // then update the statement imports in a separate batch operation
    const bookedResults: { impId: string; entryId: string }[] = [];

    for (const imp of imports) {
      const sourceIsDebitNormal = isDebitNormal(imp.sourceAccount.type);

      // Determine debit/credit based on source account type and transaction direction
      // For bank accounts (debit-normal assets):
      //   - Bank debit (money OUT): DEBIT target, CREDIT source
      //   - Bank credit (money IN): DEBIT source, CREDIT target
      // For credit cards (credit-normal):
      //   - CC charge (debit = money spent): DEBIT target (expense), CREDIT source
      //   - CC payment (credit = payment): DEBIT source, CREDIT target

      let debitAccountId: string;
      let creditAccountId: string;

      if (sourceIsDebitNormal) {
        // Bank account (asset)
        if (imp.isDebit) {
          // Money OUT of bank: debit target (expense), credit bank
          debitAccountId = imp.targetAccountId!;
          creditAccountId = imp.sourceAccountId;
        } else {
          // Money IN to bank: debit bank, credit target (income/etc)
          debitAccountId = imp.sourceAccountId;
          creditAccountId = imp.targetAccountId!;
        }
      } else {
        // Credit card (credit-normal)
        if (imp.isDebit) {
          // CC charge (expense): debit target (expense), credit CC
          debitAccountId = imp.targetAccountId!;
          creditAccountId = imp.sourceAccountId;
        } else {
          // CC payment/credit: debit CC, credit target
          debitAccountId = imp.sourceAccountId;
          creditAccountId = imp.targetAccountId!;
        }
      }

      const entry = await createJournalEntry({
        companyId: companyId!,
        date: imp.postDate,
        memo: imp.memo || imp.description,
        referenceNumber: imp.checkNumber || undefined,
        notes: imp.note || undefined,
        source: 'statement_import',
        sourceId: imp.id,
        lines: [
          {
            accountId: debitAccountId,
            description: imp.memo || imp.description,
            debit: imp.amount,
            credit: 0,
          },
          {
            accountId: creditAccountId,
            description: imp.memo || imp.description,
            debit: 0,
            credit: imp.amount,
          },
        ],
      });

      bookedResults.push({ impId: imp.id, entryId: entry.id });
    }

    // Now update all statement imports in a single batch transaction
    await prisma.$transaction(
      bookedResults.map((result) =>
        prisma.statementImport.update({
          where: { id: result.impId },
          data: {
            status: 'booked',
            journalEntryId: result.entryId,
          },
        })
      )
    );

    const journalEntriesCreated = bookedResults.length;
    const bookedIds = bookedResults.map((r) => r.impId);

    // Log audit entry
    await prisma.auditLog.create({
      data: {
        userId: session!.userId,
        companyId: companyId!,
        action: 'STATEMENT_BOOK',
        entityType: 'StatementImport',
        entityId: bookedIds.join(','),
        metadata: JSON.stringify({
          booked: bookedIds.length,
          journalEntriesCreated,
        }),
      },
    });

    return NextResponse.json({
      booked: bookedIds.length,
      journalEntriesCreated,
    });
  } catch (err) {
    console.error('Error booking statements:', err);
    const message = err instanceof Error ? err.message : 'Failed to book statements';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
