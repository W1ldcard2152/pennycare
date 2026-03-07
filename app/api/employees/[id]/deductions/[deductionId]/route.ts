import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';

// PUT /api/employees/[id]/deductions/[deductionId] - Update a deduction
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deductionId: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const { id, deductionId } = await params;

    // Verify employee belongs to this company
    const employee = await prisma.employee.findFirst({
      where: { id, companyId: companyId! },
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Verify deduction belongs to this employee
    const existing = await prisma.employeeDeduction.findFirst({
      where: { id: deductionId, employeeId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Deduction not found' }, { status: 404 });
    }

    const data = await request.json();

    const deduction = await prisma.employeeDeduction.update({
      where: { id: deductionId },
      data: {
        deductionType: data.deductionType,
        name: data.name,
        amountType: data.amountType,
        amount: parseFloat(data.amount),
        preTax: data.preTax,
        annualLimit: data.annualLimit ? parseFloat(data.annualLimit) : null,
        ytdAmount: data.ytdAmount ? parseFloat(data.ytdAmount) : 0,
        caseNumber: data.caseNumber || null,
        totalOwed: data.totalOwed ? parseFloat(data.totalOwed) : null,
        remainingBalance: data.remainingBalance ? parseFloat(data.remainingBalance) : null,
        isActive: data.isActive,
        effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'deduction.update',
      entityType: 'EmployeeDeduction',
      entityId: deductionId,
      metadata: { employeeId: id, name: deduction.name },
    });

    return NextResponse.json(deduction);
  } catch (error) {
    console.error('Error updating deduction:', error);
    return NextResponse.json(
      { error: 'Failed to update deduction' },
      { status: 500 }
    );
  }
}

// DELETE /api/employees/[id]/deductions/[deductionId] - Delete a deduction
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deductionId: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const { id, deductionId } = await params;

    // Verify employee belongs to this company
    const employee = await prisma.employee.findFirst({
      where: { id, companyId: companyId! },
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Verify deduction exists and belongs to this employee
    const existing = await prisma.employeeDeduction.findFirst({
      where: { id: deductionId, employeeId: id },
      select: { id: true, name: true, deductionType: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Deduction not found' }, { status: 404 });
    }

    await prisma.employeeDeduction.delete({
      where: { id: deductionId },
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'deduction.delete',
      entityType: 'EmployeeDeduction',
      entityId: deductionId,
      metadata: { employeeId: id, name: existing.name, deductionType: existing.deductionType },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting deduction:', error);
    return NextResponse.json(
      { error: 'Failed to delete deduction' },
      { status: 500 }
    );
  }
}
