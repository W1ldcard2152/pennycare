import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/time-entries - Get time entries for a date range
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        companyId: companyId!,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: [
        { date: 'asc' },
        { employee: { lastName: 'asc' } },
      ],
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Format dates for JSON
    const formattedEntries = entries.map((entry) => ({
      ...entry,
      date: entry.date.toISOString().split('T')[0],
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    }));

    return NextResponse.json(formattedEntries);
  } catch (error) {
    console.error('Error fetching time entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch time entries' },
      { status: 500 }
    );
  }
}

// POST /api/time-entries - Create or update time entry
export async function POST(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const body = await request.json();
    const { employeeId, date, hoursWorked, overtimeHours, notes } = body;

    if (!employeeId || !date) {
      return NextResponse.json(
        { error: 'employeeId and date are required' },
        { status: 400 }
      );
    }

    // Check if entry already exists for this employee and date
    const existing = await prisma.timeEntry.findFirst({
      where: {
        companyId: companyId!,
        employeeId,
        date: new Date(date),
      },
    });

    let entry;
    if (existing) {
      // Update existing entry
      entry = await prisma.timeEntry.update({
        where: { id: existing.id },
        data: {
          hoursWorked: hoursWorked || 0,
          overtimeHours: overtimeHours || 0,
          notes,
        },
      });
    } else {
      // Create new entry
      entry = await prisma.timeEntry.create({
        data: {
          companyId: companyId!,
          employeeId,
          date: new Date(date),
          hoursWorked: hoursWorked || 0,
          overtimeHours: overtimeHours || 0,
          notes,
        },
      });
    }

    return NextResponse.json({
      ...entry,
      date: entry.date.toISOString().split('T')[0],
    });
  } catch (error) {
    console.error('Error saving time entry:', error);
    return NextResponse.json(
      { error: 'Failed to save time entry' },
      { status: 500 }
    );
  }
}
