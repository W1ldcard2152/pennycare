import { prisma } from '../lib/db';

async function main() {
  const employees = await prisma.employee.findMany();
  console.log(JSON.stringify(employees, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
