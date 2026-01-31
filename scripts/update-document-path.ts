import { prisma } from '../lib/db';

async function main() {
  // Update the document path for Test Testerson
  const result = await prisma.employeeDocument.updateMany({
    where: {
      filePath: {
        contains: 'cmksukpoz0000i40kqs021mqy'
      }
    },
    data: {
      filePath: 'uploads\\employees\\Testerson_Test\\1769291849093_Screenshot_2026-01-12_101845.jpg'
    }
  });

  console.log('Updated documents:', result.count);

  // Show all documents
  const docs = await prisma.employeeDocument.findMany();
  console.log('\nAll documents:');
  console.log(JSON.stringify(docs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
