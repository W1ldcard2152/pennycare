import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create user
  const passwordHash = await bcrypt.hash('password123', 12);
  const user = await prisma.user.create({
    data: {
      email: 'admin@pennycare.dev',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
    },
  });

  // Create company
  const company = await prisma.company.create({
    data: {
      companyName: 'Wayne Auto Repair',
      legalBusinessName: 'Wayne Auto Repair LLC',
      fein: '12-3456789',
      address: '123 Main Street',
      city: 'Wayne',
      state: 'NY',
      zipCode: '14787',
      phone: '3155551234',
      email: 'info@wayneautorepair.com',
      industryType: 'Automotive Repair',
      fiscalYearEnd: '12-31',
      defaultPayPeriod: 'weekly',
      overtimeEnabled: true,
      overtimeMultiplier: 1.5,
      suiRate: 2.1,
      futaRate: 0.6,
      nycEmployer: false,
      nextEmployeeNumber: 3,
      federalDepositSchedule: 'monthly',
      reminderLeadDays: 7,
    },
  });

  // Link user to company as owner
  await prisma.userCompanyAccess.create({
    data: {
      userId: user.id,
      companyId: company.id,
      role: 'owner',
    },
  });

  // Create Employee 1: Hourly mechanic
  const emp1 = await prisma.employee.create({
    data: {
      companyId: company.id,
      firstName: 'Mike',
      lastName: 'Johnson',
      email: 'mike.johnson@wayneautorepair.com',
      phone: '3155559876',
      address: '456 Oak Avenue',
      city: 'Wayne',
      state: 'NY',
      zipCode: '14787',
      employeeNumber: '001',
      position: 'Lead Mechanic',
      employmentType: 'full-time',
      department: 'Service',
      hireDate: new Date('2024-03-15'),
      isActive: true,
      payType: 'hourly',
      hourlyRate: 32.00,
      w4FormType: '2020_later',
      w4FilingStatus: 'married',
      w4Allowances: 2,
      federalTaxesWithheld: true,
      stateTaxesWithheld: true,
      disabilityTaxesWithheld: true,
      paidFamilyLeaveTaxesWithheld: true,
      stateFilingStatus: 'married',
      stateResidency: 'resident',
      stateAllowances: 2,
      paymentInfo: {
        create: {
          paymentMethod: 'direct_deposit',
          accountType: 'checking',
          bankName: 'First National Bank',
        },
      },
      emergencyContact: {
        create: {
          name: 'Sarah Johnson',
          relationship: 'Spouse',
          phone: '3155554321',
        },
      },
    },
  });

  // Create Employee 2: Salaried office manager
  const emp2 = await prisma.employee.create({
    data: {
      companyId: company.id,
      firstName: 'Lisa',
      lastName: 'Martinez',
      email: 'lisa.martinez@wayneautorepair.com',
      phone: '3155558765',
      address: '789 Elm Street',
      city: 'Wayne',
      state: 'NY',
      zipCode: '14787',
      employeeNumber: '002',
      position: 'Office Manager',
      employmentType: 'full-time',
      department: 'Admin',
      hireDate: new Date('2023-08-01'),
      isActive: true,
      payType: 'salary',
      annualSalary: 52000,
      w4FormType: '2020_later',
      w4FilingStatus: 'single',
      w4Allowances: 1,
      federalTaxesWithheld: true,
      stateTaxesWithheld: true,
      disabilityTaxesWithheld: true,
      paidFamilyLeaveTaxesWithheld: true,
      stateFilingStatus: 'single',
      stateResidency: 'resident',
      stateAllowances: 1,
      paymentInfo: {
        create: {
          paymentMethod: 'direct_deposit',
          accountType: 'checking',
          bankName: 'Community Savings Bank',
        },
      },
      emergencyContact: {
        create: {
          name: 'Carlos Martinez',
          relationship: 'Brother',
          phone: '3155551111',
        },
      },
    },
  });

  // Add a 401k deduction for Mike
  await prisma.employeeDeduction.create({
    data: {
      employeeId: emp1.id,
      deductionType: '401k',
      name: '401(k) Contribution',
      amountType: 'percentage',
      amount: 5,
      preTax: true,
      annualLimit: 23500,
      ytdAmount: 0,
      isActive: true,
    },
  });

  // Add health insurance deduction for both
  await prisma.employeeDeduction.createMany({
    data: [
      {
        employeeId: emp1.id,
        deductionType: 'health_insurance',
        name: 'Health Insurance',
        amountType: 'fixed',
        amount: 125,
        preTax: true,
        ytdAmount: 0,
        isActive: true,
      },
      {
        employeeId: emp2.id,
        deductionType: 'health_insurance',
        name: 'Health Insurance',
        amountType: 'fixed',
        amount: 95,
        preTax: true,
        ytdAmount: 0,
        isActive: true,
      },
    ],
  });

  console.log('Seed complete!');
  console.log(`  User: admin@pennycare.dev / password123`);
  console.log(`  Company: ${company.companyName} (ID: ${company.id})`);
  console.log(`  Employee 1: ${emp1.firstName} ${emp1.lastName} - ${emp1.position} ($${emp1.hourlyRate}/hr)`);
  console.log(`  Employee 2: ${emp2.firstName} ${emp2.lastName} - ${emp2.position} ($${emp2.annualSalary}/yr)`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
