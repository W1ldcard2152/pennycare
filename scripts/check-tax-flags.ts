import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const fields = [
    'federalTaxability',
    'stateTaxability',
    'socialSecurityTaxability',
    'medicareTaxability',
    'unemploymentTaxability',
    'disabilityTaxability',
    'paidFamilyLeaveTaxability',
  ] as const;

  for (const f of fields) {
    const r = await p.employee.updateMany({
      where: { [f]: null },
      data: { [f]: 'taxable' },
    });
    console.log(`Backfilled ${f} on ${r.count} employee(s).`);
  }

  const verify = await p.employee.findMany({
    select: {
      firstName: true,
      lastName: true,
      federalTaxability: true,
      stateTaxability: true,
      socialSecurityTaxability: true,
      medicareTaxability: true,
      unemploymentTaxability: true,
      disabilityTaxability: true,
      paidFamilyLeaveTaxability: true,
    },
  });
  console.log(JSON.stringify(verify, null, 2));
  await p.$disconnect();
}

main();
