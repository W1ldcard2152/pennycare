import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { startOfDay, endOfDay, formatDate } from '@/lib/date-utils';

// GET /api/admin/audit
// Returns paginated audit log entries with filters
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;

    const { searchParams } = new URL(request.url);

    // Parse query params
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const userId = searchParams.get('userId');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '25', 10)));

    // Build where clause
    const where: Record<string, unknown> = {
      companyId: companyId!,
    };

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Record<string, Date>).gte = startOfDay(startDate);
      }
      if (endDate) {
        (where.createdAt as Record<string, Date>).lte = endOfDay(endDate);
      }
    }

    // Action filter
    if (action) {
      where.action = action;
    }

    // Entity type filter
    if (entityType) {
      where.entityType = entityType;
    }

    // User filter
    if (userId) {
      where.userId = userId;
    }

    // Search filter (across action, entityType, entityId, metadata)
    if (search) {
      where.OR = [
        { action: { contains: search } },
        { entityType: { contains: search } },
        { entityId: { contains: search } },
        { metadata: { contains: search } },
      ];
    }

    // Get total count and entries in parallel
    const [total, entries, distinctActions, distinctEntityTypes, users] = await Promise.all([
      prisma.auditLog.count({ where }),

      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),

      // Get distinct actions for filter dropdown
      prisma.auditLog.findMany({
        where: { companyId: companyId! },
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' },
      }),

      // Get distinct entity types for filter dropdown
      prisma.auditLog.findMany({
        where: { companyId: companyId! },
        select: { entityType: true },
        distinct: ['entityType'],
        orderBy: { entityType: 'asc' },
      }),

      // Get users who have access to this company
      prisma.userCompanyAccess.findMany({
        where: { companyId: companyId! },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    // Get user info for each entry
    const userIds = [...new Set(entries.map((e) => e.userId))];
    const userMap = new Map<string, { email: string; firstName: string; lastName: string }>();

    if (userIds.length > 0) {
      const usersData = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      for (const u of usersData) {
        userMap.set(u.id, { email: u.email, firstName: u.firstName, lastName: u.lastName });
      }
    }

    // Format entries for response
    const formattedEntries = entries.map((entry) => {
      const user = userMap.get(entry.userId);
      let metadata: Record<string, unknown> | null = null;
      let changes: Record<string, { old: unknown; new: unknown }> | null = null;

      try {
        if (entry.metadata) {
          metadata = JSON.parse(entry.metadata);
        }
      } catch {
        metadata = null;
      }

      try {
        if (entry.changes) {
          changes = JSON.parse(entry.changes);
        }
      } catch {
        changes = null;
      }

      return {
        id: entry.id,
        timestamp: entry.createdAt.toISOString(),
        userId: entry.userId,
        userName: user ? `${user.firstName} ${user.lastName}` : entry.userId,
        userEmail: user?.email || null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata,
        changes,
      };
    });

    // Get summary stats
    const lastActivity = entries.length > 0 ? entries[0].createdAt.toISOString() : null;

    return NextResponse.json({
      entries: formattedEntries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalEntries: total,
        lastActivity,
      },
      filters: {
        actions: distinctActions.map((a) => a.action),
        entityTypes: distinctEntityTypes.map((e) => e.entityType),
        users: users.map((u) => ({
          id: u.user.id,
          name: `${u.user.firstName} ${u.user.lastName}`,
          email: u.user.email,
        })),
      },
    });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
