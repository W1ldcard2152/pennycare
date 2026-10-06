import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { voidPayrollSchema, validateRequest } from '@/lib/validation';
import { voidEntry } from '@/lib/journal-entry-service';
import { logAudit } from '@/lib/audit';
import { reverseDeductionYtd } from '@/lib/payroll-input';

// POST /api/payroll/[id]/void - Void a payroll record
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('APPROVER');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    // Validate
    const validation = validateRequest(voidPayrollSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    const { reason } = validation.data;

    // Fetch the record
    const record = await prisma.payrollRecord.findFirst({
      where: { id, companyId: companyId! },
      include: { employee: { select: { firstName: true, lastName: true, deductions: true } } },
    });

    if (!record) {
      return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 });
    }

    if (record.status !== 'active') {
      return NextResponse.json(
        { error: `Cannot void a record that is already ${record.status}` },
        { status: 400 }
      );
    }

    // Record void + YTD reversal + JE voids all commit together (1.2). The JE
    // voids go through the service, so a payroll JE dated in a closed period
    // now surfaces a visible error instead of silently bypassing the guard.
    const actor = { userId: session!.userId, role: role! };
    const voided = await prisma.$transaction(async (tx) => {
      const voided = await tx.payrollRecord.update({
        where: { id },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: session!.userId,
          voidReason: reason,
        },
      });

      // Take this payroll's deductions back off the deductions' YTD.
      await reverseDeductionYtd(tx, record);

      // Void associated payroll journal entries via the service.
      const relatedEntries = await tx.journalEntry.findMany({
        where: { companyId: companyId!, source: 'payroll', status: 'posted' },
        select: { id: true, sourceId: true },
      });
      for (const entry of relatedEntries) {
        // sourceId is a comma-separated list of record ids
        if (entry.sourceId && entry.sourceId.split(',').map((s) => s.trim()).includes(id)) {
          await voidEntry(actor, entry.id, `Auto-voided: payroll record ${id} was voided (${reason})`, tx);
        }
      }

      return voided;
    }, { timeout: 20000 });

    // Audit log
    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'payroll.void',
      entityType: 'PayrollRecord',
      entityId: id,
      metadata: {
        reason,
        employeeId: record.employeeId,
        employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
        grossPay: record.grossPay,
        payPeriod: `${record.payPeriodStart.toISOString().split('T')[0]} to ${record.payPeriodEnd.toISOString().split('T')[0]}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payroll record voided successfully',
      record: voided,
    });
  } catch (error) {
    console.error('Error voiding payroll record:', error);
    return NextResponse.json(
      { error: 'Failed to void payroll record' },
      { status: 500 }
    );
  }
}
