import { PrismaClient } from '@prisma/client';
import CryptoJS from 'crypto-js';

const prisma = new PrismaClient();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'dev-key-change-in-production';

function encrypt(text: string): string {
  if (!text) return '';
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

async function main() {
  console.log('Seeding test employee data for NY State payroll...\n');

  // Find company via UserCompanyAccess so the employee gets added to a company
  // that your user account actually has access to
  const access = await prisma.userCompanyAccess.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { company: true },
  });
  let company = access?.company ?? await prisma.company.findFirst();

  if (!company) {
    console.log('Creating test company...');
    company = await prisma.company.create({
      data: {
        companyName: 'Test Plumbing & Heating Co.',
        legalBusinessName: 'Test Plumbing & Heating Co., Inc.',
        fein: '12-3456789',
        address: '123 Main Street',
        city: 'Rochester',
        state: 'NY',
        zipCode: '14618',
        phone: '585-555-1234',
        email: 'info@testplumbing.com',
        industryType: 'Plumbing, Heating, and Air-Conditioning Contractors',
        fiscalYearEnd: '12-31',

        // Payroll Settings
        defaultPayPeriod: 'weekly',
        overtimeEnabled: true,
        overtimeMultiplier: 1.5,

        // NY State Tax IDs
        stateUIClientId: 'NY-UI-123456-7',
        stateTaxId: 'NY-WH-987654321',
        localTaxId: null, // Wayne County - no local income tax
        suiRate: 3.4, // Example rate - varies by employer experience
        futaRate: 0.6, // Standard FUTA rate after state credit

        nycEmployer: false, // Not NYC based

        // Workers Comp
        workersCompPolicy: 'WC-2026-78901',
        workersCompCarrier: 'State Insurance Fund',

        // Bank Info (encrypted)
        bankName: 'First National Bank',
        bankRoutingNumberEncrypted: encrypt('021000021'),
        bankAccountNumberEncrypted: encrypt('123456789012'),

        // PTO Policies
        defaultPTODays: 10,
        defaultSickDays: 5,
        ptoAccrualEnabled: true,
      },
    });
    console.log('✓ Created company:', company.companyName);
  } else {
    console.log('✓ Using existing company:', company.companyName);
    if (access) {
      console.log('  (linked to user via UserCompanyAccess, role:', access.role + ')');
    }

    // Update company with NY-specific fields if missing
    company = await prisma.company.update({
      where: { id: company.id },
      data: {
        suiRate: company.suiRate || 3.4,
        futaRate: 0.6,
        nycEmployer: false,
      },
    });
  }

  // Check if Test Testerson already exists
  let employee = await prisma.employee.findFirst({
    where: {
      firstName: 'Test',
      lastName: 'Testerson',
      companyId: company.id,
    },
  });

  if (employee) {
    console.log('✓ Test Testerson already exists, updating with full NY payroll data...');

    // Update with complete NY payroll fields
    employee = await prisma.employee.update({
      where: { id: employee.id },
      data: {
        // Personal Information
        middleName: 'Q',
        dateOfBirth: new Date('1985-06-15'),
        email: 'test.testerson@email.com',
        phone: '585-555-9876',
        address: '456 Elm Street',
        city: 'Palmyra',
        state: 'NY',
        zipCode: '14522',

        // Employment Details
        position: 'Licensed Plumber',
        employmentType: 'full-time',
        department: 'Field Operations',
        hireDate: new Date('2023-03-15'),
        terminationDate: null,
        isActive: true,

        // Pay Information
        payType: 'hourly',
        hourlyRate: 32.50, // $32.50/hour
        annualSalary: null,
        payFrequency: 'weekly',

        // SSN (encrypted)
        taxIdEncrypted: encrypt('123-45-6789'),

        // Federal Tax Settings (W-4 2020 or later)
        w4FormType: '2020_later',
        w4FilingStatus: 'married',
        w4Allowances: 2,
        additionalWithholding: 0,
        additionalWithholdingPercentage: null,
        overrideAmount: null,
        overridePercentage: null,
        federalTaxability: 'taxable',
        federalTaxesWithheld: true,
        federalResidency: 'resident',

        // Social Security & Medicare
        socialSecurityTaxability: 'taxable',
        medicareTaxability: 'taxable',

        // NY State Tax Settings (IT-2104)
        stateFilingStatus: 'married',
        stateResidency: 'resident',
        stateAllowances: 2,
        stateTaxesWithheld: true,
        stateTaxability: 'taxable',

        // NYC/Yonkers local tax
        nycResident: false,
        yonkersResident: false,
        yonkersNonResident: false,

        // NY State Programs
        unemploymentTaxability: 'taxable',
        worksiteCode: null,
        dependentHealthInsurance: false,

        // NY Disability Insurance
        disabilityTaxability: 'taxable',
        disabilityTaxesWithheld: true,

        // NY Paid Family Leave
        paidFamilyLeaveTaxability: 'taxable',
        paidFamilyLeaveTaxesWithheld: true,

        // Workers Comp Class Code
        workersCompClassCode: '5183', // Plumbing - NOC
      },
    });
  } else {
    console.log('Creating Test Testerson employee...');

    employee = await prisma.employee.create({
      data: {
        companyId: company.id,

        // Personal Information
        firstName: 'Test',
        lastName: 'Testerson',
        middleName: 'Q',
        dateOfBirth: new Date('1985-06-15'),
        email: 'test.testerson@email.com',
        phone: '585-555-9876',
        address: '456 Elm Street',
        city: 'Palmyra',
        state: 'NY',
        zipCode: '14522',

        // Employment Details
        employeeNumber: 'EMP-001',
        position: 'Licensed Plumber',
        employmentType: 'full-time',
        department: 'Field Operations',
        hireDate: new Date('2023-03-15'),
        terminationDate: null,
        isActive: true,

        // Pay Information
        payType: 'hourly',
        hourlyRate: 32.50, // $32.50/hour
        annualSalary: null,
        payFrequency: 'weekly',

        // SSN (encrypted)
        taxIdEncrypted: encrypt('123-45-6789'),

        // Federal Tax Settings (W-4 2020 or later)
        w4FormType: '2020_later',
        w4FilingStatus: 'married', // Married filing jointly
        w4Allowances: 2,
        additionalWithholding: 0,
        additionalWithholdingPercentage: null,
        overrideAmount: null,
        overridePercentage: null,
        federalTaxability: 'taxable',
        federalTaxesWithheld: true,
        federalResidency: 'resident',

        // Social Security & Medicare
        socialSecurityTaxability: 'taxable',
        medicareTaxability: 'taxable',

        // NY State Tax Settings (IT-2104)
        stateFilingStatus: 'married',
        stateResidency: 'resident',
        stateAllowances: 2,
        stateTaxesWithheld: true,
        stateTaxability: 'taxable',

        // NYC/Yonkers local tax (Wayne County - no local)
        nycResident: false,
        yonkersResident: false,
        yonkersNonResident: false,

        // NY State Programs
        unemploymentTaxability: 'taxable',
        worksiteCode: null,
        dependentHealthInsurance: false,

        // NY Disability Insurance
        disabilityTaxability: 'taxable',
        disabilityTaxesWithheld: true,

        // NY Paid Family Leave
        paidFamilyLeaveTaxability: 'taxable',
        paidFamilyLeaveTaxesWithheld: true,

        // Workers Comp Class Code
        workersCompClassCode: '5183', // Plumbing - NOC
      },
    });

    console.log('✓ Created employee:', `${employee.firstName} ${employee.lastName}`);
  }

  // Create or update Payment Info (Direct Deposit)
  const existingPaymentInfo = await prisma.paymentInfo.findUnique({
    where: { employeeId: employee.id },
  });

  if (!existingPaymentInfo) {
    await prisma.paymentInfo.create({
      data: {
        employeeId: employee.id,
        paymentMethod: 'direct_deposit',
        bankName: 'Chase Bank',
        routingNumberEncrypted: encrypt('021000021'),
        accountNumberEncrypted: encrypt('987654321098'),
        accountType: 'checking',
      },
    });
    console.log('✓ Created direct deposit info');
  } else {
    console.log('✓ Payment info already exists');
  }

  // Create or update Emergency Contact
  const existingEmergencyContact = await prisma.emergencyContact.findUnique({
    where: { employeeId: employee.id },
  });

  if (!existingEmergencyContact) {
    await prisma.emergencyContact.create({
      data: {
        employeeId: employee.id,
        name: 'Jane Testerson',
        relationship: 'Spouse',
        phone: '585-555-4321',
        alternatePhone: '585-555-8765',
      },
    });
    console.log('✓ Created emergency contact');
  } else {
    console.log('✓ Emergency contact already exists');
  }

  // Create Employee Deductions (benefits)
  const existingDeductions = await prisma.employeeDeduction.findMany({
    where: { employeeId: employee.id },
  });

  if (existingDeductions.length === 0) {
    console.log('Creating employee deductions (benefits)...');

    // 401(k) contribution - 6% pre-tax
    await prisma.employeeDeduction.create({
      data: {
        employeeId: employee.id,
        deductionType: '401k',
        name: '401(k) Contribution',
        amountType: 'percentage',
        amount: 6, // 6% of gross
        preTax: true,
        annualLimit: 23000, // 2026 401k limit
        ytdAmount: 0,
        isActive: true,
        effectiveDate: new Date('2023-03-15'),
      },
    });
    console.log('  ✓ 401(k) - 6% pre-tax');

    // Health Insurance - Employee portion
    await prisma.employeeDeduction.create({
      data: {
        employeeId: employee.id,
        deductionType: 'health_insurance',
        name: 'Health Insurance (Family)',
        amountType: 'fixed',
        amount: 185.00, // Per pay period (weekly)
        preTax: true,
        annualLimit: null,
        ytdAmount: 0,
        isActive: true,
        effectiveDate: new Date('2023-03-15'),
      },
    });
    console.log('  ✓ Health Insurance - $185/week pre-tax');

    // Dental Insurance
    await prisma.employeeDeduction.create({
      data: {
        employeeId: employee.id,
        deductionType: 'dental',
        name: 'Dental Insurance (Family)',
        amountType: 'fixed',
        amount: 25.00, // Per pay period (weekly)
        preTax: true,
        annualLimit: null,
        ytdAmount: 0,
        isActive: true,
        effectiveDate: new Date('2023-03-15'),
      },
    });
    console.log('  ✓ Dental Insurance - $25/week pre-tax');

    // Vision Insurance
    await prisma.employeeDeduction.create({
      data: {
        employeeId: employee.id,
        deductionType: 'vision',
        name: 'Vision Insurance (Family)',
        amountType: 'fixed',
        amount: 8.00, // Per pay period (weekly)
        preTax: true,
        annualLimit: null,
        ytdAmount: 0,
        isActive: true,
        effectiveDate: new Date('2023-03-15'),
      },
    });
    console.log('  ✓ Vision Insurance - $8/week pre-tax');

    console.log('✓ Created all deductions');
  } else {
    console.log('✓ Deductions already exist:', existingDeductions.length, 'deduction(s)');
  }

  // Create sample time entries for current week
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday

  // Check if time entries exist for this week
  const existingTimeEntries = await prisma.timeEntry.findMany({
    where: {
      employeeId: employee.id,
      date: {
        gte: startOfWeek,
      },
    },
  });

  if (existingTimeEntries.length === 0) {
    console.log('Creating sample time entries for current week...');

    // Monday - Friday, 8 hours each day + 2 hours OT on Thursday
    const daysWorked = [1, 2, 3, 4, 5]; // Mon-Fri

    for (const dayOffset of daysWorked) {
      const workDate = new Date(startOfWeek);
      workDate.setDate(startOfWeek.getDate() + dayOffset);

      // Skip future dates
      if (workDate > today) continue;

      await prisma.timeEntry.create({
        data: {
          companyId: company.id,
          employeeId: employee.id,
          date: workDate,
          hoursWorked: 8,
          overtimeHours: dayOffset === 4 ? 2 : 0, // 2 hours OT on Thursday
          notes: dayOffset === 4 ? 'Emergency service call - overtime' : null,
        },
      });
    }
    console.log('✓ Created time entries for the current week');
  } else {
    console.log('✓ Time entries already exist for current week');
  }

  // Summary
  console.log('\n========================================');
  console.log('TEST EMPLOYEE SUMMARY');
  console.log('========================================');
  console.log(`Name: ${employee.firstName} ${employee.middleName} ${employee.lastName}`);
  console.log(`Employee #: ${employee.employeeNumber}`);
  console.log(`Position: ${employee.position}`);
  console.log(`Pay Rate: $${employee.hourlyRate}/hour`);
  console.log(`Pay Frequency: ${employee.payFrequency}`);
  console.log(`Filing Status: ${employee.w4FilingStatus} (Federal), ${employee.stateFilingStatus} (NY)`);
  console.log(`Allowances: ${employee.w4Allowances} (Federal), ${employee.stateAllowances} (NY)`);
  console.log(`Location: ${employee.city}, ${employee.state} ${employee.zipCode}`);
  console.log(`NYC Resident: ${employee.nycResident ? 'Yes' : 'No'}`);
  console.log(`Workers Comp Class: ${employee.workersCompClassCode}`);
  console.log('');
  console.log('DEDUCTIONS:');
  console.log('  - 401(k): 6% pre-tax');
  console.log('  - Health Insurance: $185/week pre-tax');
  console.log('  - Dental: $25/week pre-tax');
  console.log('  - Vision: $8/week pre-tax');
  console.log('');
  console.log('NY STATE TAXES:');
  console.log('  - State Income Tax: Withheld');
  console.log('  - SDI (Disability): Withheld');
  console.log('  - PFL (Paid Family Leave): Withheld');
  console.log('  - SUI (Unemployment): Employer pays');
  console.log('========================================\n');

  console.log('Seed complete! You can now run payroll for Test Testerson.');
}

main()
  .catch((e) => {
    console.error('Error seeding test employee:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
