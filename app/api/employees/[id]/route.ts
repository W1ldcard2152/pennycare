import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/encryption';

// GET /api/employees/[id] - Get single employee
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        paymentInfo: true,
        emergencyContact: true,
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        deductions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Decrypt sensitive data for editing (only if needed)
    const decryptedEmployee = {
      ...employee,
      taxId: employee.taxIdEncrypted ? decrypt(employee.taxIdEncrypted) : null,
      paymentInfo: employee.paymentInfo
        ? {
            ...employee.paymentInfo,
            routingNumber: employee.paymentInfo.routingNumberEncrypted
              ? decrypt(employee.paymentInfo.routingNumberEncrypted)
              : null,
            accountNumber: employee.paymentInfo.accountNumberEncrypted
              ? decrypt(employee.paymentInfo.accountNumberEncrypted)
              : null,
          }
        : null,
    };

    return NextResponse.json(decryptedEmployee);
  } catch (error) {
    console.error('Error fetching employee:', error);
    return NextResponse.json(
      { error: 'Failed to fetch employee' },
      { status: 500 }
    );
  }
}

// PUT /api/employees/[id] - Update employee
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    console.log('Received update data:', data);

    // Encrypt sensitive data
    const taxIdEncrypted = data.taxId ? encrypt(data.taxId) : null;

    // Update employee
    const employee = await prisma.employee.update({
      where: { id },
      data: {
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
        position: data.position,
        employmentType: data.employmentType,
        department: data.department || null,
        hireDate: new Date(data.hireDate),
        terminationDate: data.terminationDate ? new Date(data.terminationDate) : null,
        isActive: data.isActive === 'true' || data.isActive === true,
        employeeNumber: data.employeeNumber,

        // Pay information
        payType: data.payType,
        hourlyRate: data.payType === 'hourly' && data.hourlyRate ? parseFloat(data.hourlyRate) : null,
        annualSalary: data.payType === 'salary' && data.annualSalary ? parseFloat(data.annualSalary) : null,

        // Tax information
        taxIdEncrypted,

        // Federal Tax Settings
        w4FormType: data.w4FormType || null,
        w4FilingStatus: data.w4FilingStatus || null,
        w4Allowances: data.w4Allowances ? parseInt(data.w4Allowances) : null,
        additionalWithholding: data.additionalWithholding ? parseFloat(data.additionalWithholding) : null,
        additionalWithholdingPercentage: data.additionalWithholdingPercentage ? parseFloat(data.additionalWithholdingPercentage) : null,
        overrideAmount: data.overrideAmount ? parseFloat(data.overrideAmount) : null,
        overridePercentage: data.overridePercentage ? parseFloat(data.overridePercentage) : null,
        federalTaxability: data.federalTaxability || null,
        federalTaxesWithheld: data.federalTaxesWithheld === 'true' || data.federalTaxesWithheld === true,
        federalResidency: data.federalResidency || null,

        // Social Security & Medicare
        socialSecurityTaxability: data.socialSecurityTaxability || null,
        medicareTaxability: data.medicareTaxability || null,

        // State Tax Settings
        stateFilingStatus: data.stateFilingStatus || null,
        stateResidency: data.stateResidency || null,
        stateAllowances: data.stateAllowances ? parseInt(data.stateAllowances) : null,
        stateTaxesWithheld: data.stateTaxesWithheld === 'true' || data.stateTaxesWithheld === true,
        stateTaxability: data.stateTaxability || null,

        // State Unemployment
        unemploymentTaxability: data.unemploymentTaxability || null,
        worksiteCode: data.worksiteCode || null,
        dependentHealthInsurance: data.dependentHealthInsurance === 'true' || data.dependentHealthInsurance === true,

        // State Disability
        disabilityTaxability: data.disabilityTaxability || null,
        disabilityTaxesWithheld: data.disabilityTaxesWithheld === 'true' || data.disabilityTaxesWithheld === true,

        // Paid Family Leave
        paidFamilyLeaveTaxability: data.paidFamilyLeaveTaxability || null,
        paidFamilyLeaveTaxesWithheld: data.paidFamilyLeaveTaxesWithheld === 'true' || data.paidFamilyLeaveTaxesWithheld === true,
      },
      include: {
        paymentInfo: true,
        emergencyContact: true,
      },
    });

    // Update or create payment info
    if (data.paymentMethod) {
      await prisma.paymentInfo.upsert({
        where: { employeeId: id },
        create: {
          employeeId: id,
          paymentMethod: data.paymentMethod,
          routingNumberEncrypted: data.routingNumber ? encrypt(data.routingNumber) : null,
          accountNumberEncrypted: data.accountNumber ? encrypt(data.accountNumber) : null,
          accountType: data.accountType || null,
          bankName: data.bankName || null,
        },
        update: {
          paymentMethod: data.paymentMethod,
          routingNumberEncrypted: data.routingNumber ? encrypt(data.routingNumber) : null,
          accountNumberEncrypted: data.accountNumber ? encrypt(data.accountNumber) : null,
          accountType: data.accountType || null,
          bankName: data.bankName || null,
        },
      });
    }

    // Update or create emergency contact
    if (data.emergencyContactName) {
      await prisma.emergencyContact.upsert({
        where: { employeeId: id },
        create: {
          employeeId: id,
          name: data.emergencyContactName,
          relationship: data.emergencyContactRelationship,
          phone: data.emergencyContactPhone,
          alternatePhone: data.emergencyContactAlternatePhone || null,
        },
        update: {
          name: data.emergencyContactName,
          relationship: data.emergencyContactRelationship,
          phone: data.emergencyContactPhone,
          alternatePhone: data.emergencyContactAlternatePhone || null,
        },
      });
    }

    return NextResponse.json(employee);
  } catch (error) {
    console.error('Error updating employee:', error);
    console.error('Error details:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to update employee', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/employees/[id] - Delete employee
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.employee.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting employee:', error);
    return NextResponse.json(
      { error: 'Failed to delete employee' },
      { status: 500 }
    );
  }
}
