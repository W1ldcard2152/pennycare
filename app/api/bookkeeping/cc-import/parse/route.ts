import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { parseCCStatement } from '@/lib/cc-parsers';

// POST /api/bookkeeping/cc-import/parse
// Parse pasted credit card statement text (no DB writes)
export async function POST(request: NextRequest) {
  try {
    const { error } = await requireCompanyAccess();
    if (error) return error;

    const body = await request.json();
    const { format, transactionsText, paymentsText, statementEndDate } = body;

    // Validate required fields
    if (!format || !['capital_one', 'chase', 'paypal_credit'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Must be capital_one, chase, or paypal_credit' },
        { status: 400 }
      );
    }

    if (!statementEndDate) {
      return NextResponse.json(
        { error: 'Statement end date is required' },
        { status: 400 }
      );
    }

    // Parse statement end date to extract year
    const endDate = new Date(statementEndDate);
    if (isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid statement end date' },
        { status: 400 }
      );
    }
    const year = endDate.getFullYear();
    const statementEndMonth = endDate.getUTCMonth(); // 0-indexed

    // Parse the text
    const result = parseCCStatement(
      format,
      transactionsText || '',
      paymentsText || '',
      year,
      statementEndMonth
    );

    // Convert dates to ISO strings for JSON
    const transactions = result.transactions.map(t => ({
      transDate: t.transDate.toISOString(),
      postDate: t.postDate?.toISOString() || t.transDate.toISOString(),
      description: t.description,
      amount: t.amount,
      isCredit: t.isCredit,
      transactionId: t.transactionId,
    }));

    const payments = result.payments.map(t => ({
      transDate: t.transDate.toISOString(),
      postDate: t.postDate?.toISOString() || t.transDate.toISOString(),
      description: t.description,
      amount: t.amount,
      isCredit: t.isCredit,
      transactionId: t.transactionId,
      category: t.category,  // 'payment' or 'credit'
    }));

    return NextResponse.json({
      transactions,
      payments,
      errors: result.errors,
    });
  } catch (err) {
    console.error('Error parsing CC statement:', err);
    return NextResponse.json({ error: 'Failed to parse statement' }, { status: 500 });
  }
}
