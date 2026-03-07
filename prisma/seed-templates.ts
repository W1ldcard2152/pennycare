import { PrismaClient } from '@prisma/client';
import { statSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding document templates...');

  const templates = [
    // Federal Forms
    {
      documentTypeId: 'w4',
      name: 'Federal W-4 Form (2024)',
      fileName: 'W-4.pdf',
      filePath: 'document-templates/federal/W-4.pdf',
      category: 'federal',
      description: 'Employee\'s Withholding Certificate - Use this form to determine federal income tax withholding',
      isSystemTemplate: true,
      isActive: true,
    },
    {
      documentTypeId: 'i9',
      name: 'Form I-9 Employment Eligibility Verification',
      fileName: 'I-9.pdf',
      filePath: 'document-templates/federal/I-9.pdf',
      category: 'federal',
      description: 'Employment Eligibility Verification - Required for all new hires to verify identity and employment authorization',
      isSystemTemplate: true,
      isActive: true,
    },
    {
      documentTypeId: 'direct_deposit',
      name: 'Direct Deposit Authorization Form',
      fileName: 'Direct-Deposit-Authorization.pdf',
      filePath: 'document-templates/company/Direct-Deposit-Authorization.pdf',
      category: 'company',
      description: 'Authorization form for direct deposit of payroll to employee bank account',
      isSystemTemplate: true,
      isActive: true,
    },

    // New York State Forms
    {
      documentTypeId: 'nys_it2104',
      name: 'NYS IT-2104 Employee\'s Withholding Allowance Certificate',
      fileName: 'NYS-IT-2104.pdf',
      filePath: 'document-templates/state/NYS-IT-2104.pdf',
      category: 'state',
      description: 'New York State withholding certificate - Determines NY state income tax withholding',
      isSystemTemplate: true,
      isActive: true,
    },
    {
      documentTypeId: 'nys_it2104e',
      name: 'NYS IT-2104-E Certificate of Exemption',
      fileName: 'NYS-IT-2104-E.pdf',
      filePath: 'document-templates/state/NYS-IT-2104-E.pdf',
      category: 'state',
      description: 'Certificate of Exemption from Withholding - For employees claiming exemption from NY state withholding',
      isSystemTemplate: true,
      isActive: true,
    },
    {
      documentTypeId: 'nys_45',
      name: 'NYS-45 Quarterly Combined Withholding, Wage Reporting and Unemployment Insurance Return',
      fileName: 'NYS-45.pdf',
      filePath: 'document-templates/state/NYS-45.pdf',
      category: 'state',
      description: 'Quarterly combined withholding, wage reporting and unemployment insurance return for New York State',
      isSystemTemplate: true,
      isActive: true,
    },

    // Federal Payroll Tax Forms
    {
      documentTypeId: 'form_940',
      name: 'Form 940 - Employer\'s Annual Federal Unemployment (FUTA) Tax Return',
      fileName: '940.pdf',
      filePath: 'document-templates/federal/940.pdf',
      category: 'federal',
      description: 'Annual federal unemployment tax return - Due January 31st for previous year',
      isSystemTemplate: true,
      isActive: true,
    },
    {
      documentTypeId: 'form_941',
      name: 'Form 941 - Employer\'s Quarterly Federal Tax Return',
      fileName: '941.pdf',
      filePath: 'document-templates/federal/941.pdf',
      category: 'federal',
      description: 'Quarterly federal tax return for reporting income taxes, Social Security, and Medicare withheld',
      isSystemTemplate: true,
      isActive: true,
    },
    {
      documentTypeId: 'form_w2',
      name: 'Form W-2 - Wage and Tax Statement',
      fileName: 'W-2.pdf',
      filePath: 'document-templates/federal/W-2.pdf',
      category: 'federal',
      description: 'Annual wage and tax statement provided to employees - Due January 31st',
      isSystemTemplate: true,
      isActive: true,
    },
    {
      documentTypeId: 'form_w3',
      name: 'Form W-3 - Transmittal of Wage and Tax Statements',
      fileName: 'W-3.pdf',
      filePath: 'document-templates/federal/W-3.pdf',
      category: 'federal',
      description: 'Transmittal form for submitting W-2s to the Social Security Administration',
      isSystemTemplate: true,
      isActive: true,
    },
  ];

  for (const template of templates) {
    // Get file size
    const fullPath = join(process.cwd(), 'public', template.filePath);
    let fileSize = 0;
    try {
      const stats = statSync(fullPath);
      fileSize = stats.size;
    } catch (error) {
      console.warn(`Warning: Could not get file size for ${template.filePath}`);
      // Use a default size for missing files
      fileSize = 1024;
    }

    // Upsert template (create or update)
    await prisma.documentTemplate.upsert({
      where: {
        id: `system-${template.documentTypeId}`,
      },
      update: {
        ...template,
        fileSize,
      },
      create: {
        id: `system-${template.documentTypeId}`,
        ...template,
        fileSize,
        companyId: null,
      },
    });

    console.log(`✓ Added template: ${template.name}`);
  }

  console.log('\n✓ Template seeding complete!');
  console.log('\nNote: The following document types do not have official forms and should be uploaded by each company:');
  console.log('  - Driver\'s License (copy)');
  console.log('  - Social Security Card (copy)');
  console.log('  - Emergency Contact Form (company-specific)');
  console.log('  - Handbook Acknowledgment (company-specific)');
  console.log('  - Job Application (company-specific)');
  console.log('  - Offer Letter (company-specific)');
  console.log('  - Background Check Authorization (company-specific)');
  console.log('  - Drug Test Results (company-specific)');
  console.log('  - ASE Certification (employee-specific)');
  console.log('  - OSHA Training Certificate (training provider-specific)');
  console.log('  - Safety Training Records (company-specific)');
}

main()
  .catch((e) => {
    console.error('Error seeding templates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
