import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/encryption';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/employees - List all employees
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const employees = await prisma.employee.findMany({
      where: { companyId: companyId! },
      orderBy: { lastName: 'asc' },
      include: {
        paymentInfo: true,
        emergencyContact: true,
        _count: {
          select: { documents: true },
        },
      },
    });

    return NextResponse.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch employees',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST /api/employees - Create new employee
export async function POST(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const data = await request.json();

    // Encrypt sensitive data
    const taxIdEncrypted = data.taxId ? encrypt(data.taxId) : null;

    // Create employee with related data
    const employee = await prisma.employee.create({
      data: {
        companyId: companyId!,
        // Basic info
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,

        // Employment details
        employeeNumber: data.employeeNumber,
        position: data.position,
        employmentType: data.employmentType,
        department: data.department || null,
        hireDate: new Date(data.hireDate),
        isActive: true,

        // Pay information
        payType: data.payType,
        hourlyRate: data.payType === 'hourly' ? parseFloat(data.hourlyRate) : null,
        annualSalary: data.payType === 'salary' ? parseFloat(data.annualSalary) : null,

        // Tax information
        taxIdEncrypted,
        w4Allowances: data.w4Allowances ? parseInt(data.w4Allowances) : null,
        w4FilingStatus: data.filingStatus || null,
        additionalWithholding: data.additionalWithholding
          ? parseFloat(data.additionalWithholding)
          : null,

        // Payment info
        paymentInfo: data.paymentMethod
          ? {
              create: {
                paymentMethod: data.paymentMethod,
                routingNumberEncrypted: data.routingNumber
                  ? encrypt(data.routingNumber)
                  : null,
                accountNumberEncrypted: data.accountNumber
                  ? encrypt(data.accountNumber)
                  : null,
                accountType: data.accountType || null,
                bankName: data.bankName || null,
              },
            }
          : undefined,

        // Emergency contact
        emergencyContact: data.emergencyContactName
          ? {
              create: {
                name: data.emergencyContactName,
                relationship: data.emergencyContactRelationship,
                phone: data.emergencyContactPhone,
                alternatePhone: data.emergencyContactAlternatePhone || null,
              },
            }
          : undefined,
      },
      include: {
        paymentInfo: true,
        emergencyContact: true,
      },
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error('Error creating employee:', error);
    return NextResponse.json(
      { error: 'Failed to create employee' },
      { status: 500 }
    );
  }
}
