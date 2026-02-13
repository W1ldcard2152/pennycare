import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/payroll/history - Get payroll history
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeVoided = searchParams.get('includeVoided') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Build where clause
    const where: Record<string, unknown> = {
      companyId: companyId!,
    };

    // Default: only active records. Allow includeVoided=true to see all.
    if (!includeVoided) {
      where.status = 'active';
    }

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (startDate) {
      where.payDate = {
        ...(where.payDate as Record<string, unknown> || {}),
        gte: new Date(startDate),
      };
    }

    if (endDate) {
      where.payDate = {
        ...(where.payDate as Record<string, unknown> || {}),
        lte: new Date(endDate),
      };
    }

    const records = await prisma.payrollRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
            position: true,
          },
        },
      },
      orderBy: {
        payDate: 'desc',
      },
      take: limit,
    });

    // Calculate summary stats (only active records)
    const activeRecords = records.filter((r) => r.status === 'active');
    const summary = {
      totalRecords: activeRecords.length,
      totalGrossPay: activeRecords.reduce((sum, r) => sum + r.grossPay, 0),
      totalNetPay: activeRecords.reduce((sum, r) => sum + r.netPay, 0),
      totalDeductions: activeRecords.reduce((sum, r) => sum + r.totalDeductions, 0),
      totalEmployerCost: activeRecords.reduce((sum, r) => sum + r.totalEmployerCost, 0),
    };

    return NextResponse.json({
      records,
      summary,
    });
  } catch (error) {
    console.error('Error fetching payroll history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payroll history' },
      { status: 500 }
    );
  }
}
