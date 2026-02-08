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
        middleName: data.middleName || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
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
        w4Allowances: data.w4Allowances !== undefined ? parseInt(data.w4Allowances) : 0,
        w4FilingStatus: data.w4FilingStatus || data.filingStatus || 'single',
        additionalWithholding: data.additionalWithholding
          ? parseFloat(data.additionalWithholding)
          : null,

        // Tax withholding settings (default to true for new employees)
        federalTaxesWithheld: data.federalTaxesWithheld === 'true' || data.federalTaxesWithheld === true ? true : (data.federalTaxesWithheld === 'false' || data.federalTaxesWithheld === false ? false : true),
        stateTaxesWithheld: data.stateTaxesWithheld === 'true' || data.stateTaxesWithheld === true ? true : (data.stateTaxesWithheld === 'false' || data.stateTaxesWithheld === false ? false : true),
        disabilityTaxesWithheld: data.disabilityTaxesWithheld === 'true' || data.disabilityTaxesWithheld === true ? true : (data.disabilityTaxesWithheld === 'false' || data.disabilityTaxesWithheld === false ? false : true),
        paidFamilyLeaveTaxesWithheld: data.paidFamilyLeaveTaxesWithheld === 'true' || data.paidFamilyLeaveTaxesWithheld === true ? true : (data.paidFamilyLeaveTaxesWithheld === 'false' || data.paidFamilyLeaveTaxesWithheld === false ? false : true),

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

    // Increment the company's nextEmployeeNumber counter
    // Parse the employee number to determine what the next number should be
    const employeeNum = parseInt(data.employeeNumber.replace(/\D/g, ''), 10);
    if (!isNaN(employeeNum)) {
      // Get current counter value
      const company = await prisma.company.findUnique({
        where: { id: companyId! },
        select: { nextEmployeeNumber: true },
      });

      // Only update if the used number is >= current counter (to handle manual overrides)
      if (company && employeeNum >= (company.nextEmployeeNumber || 1)) {
        await prisma.company.update({
          where: { id: companyId! },
          data: { nextEmployeeNumber: employeeNum + 1 },
        });
      }
    }

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error('Error creating employee:', error);
    return NextResponse.json(
      { error: 'Failed to create employee' },
      { status: 500 }
    );
  }
}
