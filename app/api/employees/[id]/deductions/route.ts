import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createDeductionSchema, validateRequest } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

// GET /api/employees/[id]/deductions - Get all deductions for an employee
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const { id } = await params;

    // Verify employee belongs to this company
    const employee = await prisma.employee.findFirst({
      where: { id, companyId: companyId! },
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    const deductions = await prisma.employeeDeduction.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(deductions);
  } catch (error) {
    console.error('Error fetching deductions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deductions' },
      { status: 500 }
    );
  }
}

// POST /api/employees/[id]/deductions - Create a new deduction
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const { id } = await params;
    const data = await request.json();

    // Validate
    const validation = validateRequest(createDeductionSchema, data);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    const deduction = await prisma.employeeDeduction.create({
      data: {
        employeeId: id,
        deductionType: data.deductionType,
        name: data.name,
        amountType: data.amountType,
        amount: parseFloat(data.amount),
        preTax: data.preTax ?? true,
        annualLimit: data.annualLimit ? parseFloat(data.annualLimit) : null,
        ytdAmount: data.ytdAmount ? parseFloat(data.ytdAmount) : 0,
        caseNumber: data.caseNumber || null,
        totalOwed: data.totalOwed ? parseFloat(data.totalOwed) : null,
        remainingBalance: data.remainingBalance ? parseFloat(data.remainingBalance) : null,
        isActive: data.isActive ?? true,
        effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'deduction.create',
      entityType: 'EmployeeDeduction',
      entityId: deduction.id,
      metadata: { employeeId: id, deductionType: deduction.deductionType, name: deduction.name, amount: deduction.amount },
    });

    return NextResponse.json(deduction, { status: 201 });
  } catch (error) {
    console.error('Error creating deduction:', error);
    return NextResponse.json(
      { error: 'Failed to create deduction' },
      { status: 500 }
    );
  }
}
