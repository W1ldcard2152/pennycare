import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/bookkeeping/journal-entries/[id]/audit
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;
    const { id } = await params;

    // Verify the entry belongs to this company
    const entry = await prisma.journalEntry.findFirst({
      where: { id, companyId: companyId! },
      select: { id: true },
    });
    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    const logs = await prisma.auditLog.findMany({
      where: { companyId: companyId!, entityType: 'JournalEntry', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Resolve user names
    const userIds = [...new Set(logs.map(l => l.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

    const formatted = logs.map(log => {
      let metadata: Record<string, unknown> | null = null;
      try {
        if (log.metadata) metadata = JSON.parse(log.metadata);
      } catch { /* ignore */ }

      return {
        id: log.id,
        action: log.action,
        userName: userMap.get(log.userId) || 'Unknown',
        timestamp: log.createdAt.toISOString(),
        metadata,
      };
    });

    return NextResponse.json(formatted);
  } catch (err) {
    console.error('Error fetching journal entry audit logs:', err);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
