import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// PUT /api/employees/[id]/deductions/[deductionId] - Update a deduction
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deductionId: string }> }
) {
  try {
    const { deductionId } = await params;
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
    const { deductionId } = await params;

    await prisma.employeeDeduction.delete({
      where: { id: deductionId },
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
