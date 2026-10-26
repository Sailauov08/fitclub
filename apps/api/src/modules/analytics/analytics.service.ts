import { Injectable } from '@nestjs/common';
import { addDaysToKey, localDateKey, tzOffsetMinutes, zonedDateTime, CLUB_TIMEZONE } from '@fitclub/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { defaultRange, keyToDbDate, todayKey } from '../../common/dates';
import type { AuthUser } from '../../common/auth-context';

export interface RangeQuery {
  from?: string;
  to?: string;
  includeTest?: boolean;
  branchId?: string;
}

/** Every metric shown in the admin UI, with its exact formula and data source. */
export const METRIC_DEFINITIONS = {
  totalMembers: 'COUNT(Member) whose user is not deleted (branch = home branch).',
  activeMemberships: 'COUNT(Membership) with status ACTIVE and startsAt ≤ now < endsAt.',
  frozenMemberships: 'COUNT(Membership) with status FROZEN.',
  newMemberships: 'COUNT(Membership) whose activatedAt falls in the selected range.',
  expiringSoon: 'COUNT(Membership) ACTIVE with endsAt within the next 14 days.',
  todayCheckIns: 'COUNT(CheckIn) ACCEPTED with localDate = today (Asia/Almaty).',
  upcomingClasses: 'COUNT(ClassSession) SCHEDULED starting in the next 7 days.',
  revenue:
    'SUM(Payment.amount) captured (paidAt in range, status SUCCEEDED/PARTIALLY_REFUNDED/REFUNDED) − SUM(Refund.amount) created in range. Test/sandbox payments excluded unless "include test data" is on.',
  occupancyToday: "Σ bookedCount / Σ capacity for today's non-cancelled sessions.",
  bookingUtilization:
    'Σ seats taken (CONFIRMED + ATTENDED + NO_SHOW) / Σ capacity over non-cancelled sessions starting in range.',
  attendanceRate: 'ATTENDED / (ATTENDED + NO_SHOW) bookings for sessions in range.',
  renewalRate: 'RENEWED events in range / (RENEWED + EXPIRED events in range).',
  newCustomers: 'Members whose first-ever membership activation falls in the range, grouped by ISO week.',
  leadConversion: 'Leads created in range that reached WON / all leads created in range.',
  classPopularity: 'Per class type: sessions, seats taken, fill rate (seats / capacity) and attendance in range.',
} as const;

const CAPTURED = ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(actor: AuthUser, q: RangeQuery) {
    const range = q.from && q.to && q.from <= q.to ? { from: q.from, to: q.to } : defaultRange(30);
    const start = zonedDateTime(range.from);
    const end = zonedDateTime(addDaysToKey(range.to, 1));
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    const branchId = actor.staffBranchId ?? q.branchId ?? null;
    return { ...range, start, end, days, branchId, includeTest: q.includeTest ?? true };
  }

  private async revenue(start: Date, end: Date, includeTest: boolean, branchId: string | null) {
    const memberFilter: Prisma.PaymentWhereInput = branchId ? { member: { homeBranchId: branchId } } : {};
    const testFilter: Prisma.PaymentWhereInput = includeTest ? {} : { isTest: false };
    const [captured, refunds] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { status: { in: [...CAPTURED] }, paidAt: { gte: start, lt: end }, ...testFilter, ...memberFilter },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.refund.aggregate({
        where: { status: 'SUCCEEDED', createdAt: { gte: start, lt: end }, payment: { ...testFilter, ...memberFilter } },
        _sum: { amount: true },
      }),
    ]);
    const gross = captured._sum.amount ?? 0;
    const refunded = refunds._sum.amount ?? 0;
    return { gross, refunded, net: gross - refunded, payments: captured._count };
  }

  private async revenueSeries(start: Date, end: Date, includeTest: boolean, branchId: string | null) {
    const rows = await this.prisma.$queryRaw<{ day: Date; amount: bigint; count: bigint }[]>`
      SELECT date_trunc('day', p."paidAt" AT TIME ZONE ${CLUB_TIMEZONE}) AS day, SUM(p.amount)::bigint AS amount, COUNT(*)::bigint AS count
      FROM "Payment" p JOIN "Member" m ON m.id = p."memberId"
      WHERE p.status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED') AND p."paidAt" >= ${start} AND p."paidAt" < ${end}
        AND (${includeTest} OR p."isTest" = false)
        AND (${branchId}::text IS NULL OR m."homeBranchId" = ${branchId})
      GROUP BY 1 ORDER BY 1`;
    const map = new Map(
      rows.map((r) => [r.day.toISOString().slice(0, 10), { amount: Number(r.amount), count: Number(r.count) }]),
    );
    const out: { date: string; amount: number; count: number }[] = [];
    const startKey = localDateKey(start);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    for (let i = 0; i < days; i++) {
      const key = addDaysToKey(startKey, i);
      out.push({ date: key, ...(map.get(key) ?? { amount: 0, count: 0 }) });
    }
    return out;
  }

  async overview(actor: AuthUser, q: RangeQuery) {
    const r = this.resolve(actor, q);
    const now = new Date();
    const finance = actor.permissions.includes('analytics.finance');
    const memberWhere: Prisma.MemberWhereInput = {
      user: { deletedAt: null },
      ...(r.branchId ? { homeBranchId: r.branchId } : {}),
    };
    const msBranch: Prisma.MembershipWhereInput = r.branchId ? { member: { homeBranchId: r.branchId } } : {};
    const sessionBranch: Prisma.ClassSessionWhereInput = r.branchId ? { branchId: r.branchId } : {};
    const today = todayKey(now);
    const todayStart = zonedDateTime(today);
    const todayEnd = zonedDateTime(addDaysToKey(today, 1));
    const prevStart = new Date(r.start.getTime() - (r.end.getTime() - r.start.getTime()));

    const [
      totalMembers,
      activeMemberships,
      frozenMemberships,
      newMemberships,
      expiringSoon,
      todayCheckIns,
      upcomingClasses,
      todaySessions,
      unassignedLeads,
      overdueTasks,
      stalePayments,
      expiringIn3,
      recentAudit,
      recentCheckIns,
    ] = await Promise.all([
      this.prisma.member.count({ where: memberWhere }),
      this.prisma.membership.count({
        where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now }, ...msBranch },
      }),
      this.prisma.membership.count({ where: { status: 'FROZEN', ...msBranch } }),
      this.prisma.membership.count({ where: { activatedAt: { gte: r.start, lt: r.end }, ...msBranch } }),
      this.prisma.membership.count({
        where: { status: 'ACTIVE', endsAt: { gte: now, lte: new Date(now.getTime() + 14 * 86_400_000) }, ...msBranch },
      }),
      this.prisma.checkIn.count({
        where: { status: 'ACCEPTED', localDate: keyToDbDate(today), ...(r.branchId ? { branchId: r.branchId } : {}) },
      }),
      this.prisma.classSession.count({
        where: {
          status: 'SCHEDULED',
          startsAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) },
          ...sessionBranch,
        },
      }),
      this.prisma.classSession.findMany({
        where: { status: { not: 'CANCELLED' }, startsAt: { gte: todayStart, lt: todayEnd }, ...sessionBranch },
        select: { capacity: true, bookedCount: true },
      }),
      this.prisma.lead.count({ where: { assignedToId: null, status: { notIn: ['WON', 'LOST'] } } }),
      this.prisma.leadActivity.count({ where: { type: 'TASK', completedAt: null, dueAt: { lt: now } } }),
      finance
        ? this.prisma.payment.count({
            where: {
              status: { in: ['PENDING', 'REQUIRES_ACTION'] },
              createdAt: { lt: new Date(now.getTime() - 86_400_000) },
            },
          })
        : Promise.resolve(0),
      this.prisma.membership.count({
        where: { status: 'ACTIVE', endsAt: { gte: now, lte: new Date(now.getTime() + 3 * 86_400_000) }, ...msBranch },
      }),
      this.prisma.auditLog.findMany({
        where: r.branchId ? { branchId: r.branchId } : {},
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          action: true,
          entityType: true,
          createdAt: true,
          actor: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.checkIn.findMany({
        where: { status: 'ACCEPTED', ...(r.branchId ? { branchId: r.branchId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          createdAt: true,
          method: true,
          member: {
            select: { id: true, user: { select: { profile: { select: { firstName: true, lastName: true } } } } },
          },
          branch: { select: { name: true } },
        },
      }),
    ]);

    const capacity = todaySessions.reduce((s, x) => s + x.capacity, 0);
    const booked = todaySessions.reduce((s, x) => s + x.bookedCount, 0);
    const [revenue, previousRevenue, revenueTrend, testPayments] = finance
      ? await Promise.all([
          this.revenue(r.start, r.end, r.includeTest, r.branchId),
          this.revenue(prevStart, r.start, r.includeTest, r.branchId),
          this.revenueSeries(r.start, r.end, r.includeTest, r.branchId),
          this.prisma.payment.count({
            where: { isTest: true, status: { in: [...CAPTURED] }, paidAt: { gte: r.start, lt: r.end } },
          }),
        ])
      : [null, null, null, 0];

    return {
      range: { from: r.from, to: r.to, includeTest: r.includeTest },
      metrics: {
        totalMembers,
        activeMemberships,
        frozenMemberships,
        newMemberships,
        expiringSoon,
        todayCheckIns,
        upcomingClasses,
        occupancyToday: capacity ? booked / capacity : null,
        todaySessions: todaySessions.length,
      },
      finance: finance ? { revenue, previousRevenue, revenueTrend, testPaymentsInRange: testPayments } : null,
      pendingActions: { unassignedLeads, overdueTasks, stalePayments, expiringIn3Days: expiringIn3 },
      recentActivity: recentAudit,
      recentCheckIns,
      definitions: METRIC_DEFINITIONS,
    };
  }

  async reports(actor: AuthUser, q: RangeQuery) {
    const r = this.resolve(actor, q);
    const finance = actor.permissions.includes('analytics.finance');
    const b = r.branchId;
    const sessionWhere: Prisma.ClassSessionWhereInput = {
      status: { not: 'CANCELLED' },
      startsAt: { gte: r.start, lt: r.end },
      ...(b ? { branchId: b } : {}),
    };

    const [
      sessions,
      bookingStatus,
      statusBreakdown,
      salesByPlan,
      renewals,
      expiries,
      leads,
      checkinSeries,
      acquisition,
      byMethod,
    ] = await Promise.all([
      this.prisma.classSession.findMany({
        where: sessionWhere,
        select: {
          capacity: true,
          bookedCount: true,
          classTypeId: true,
          startsAt: true,
          classType: { select: { name: true, slug: true } },
        },
      }),
      this.prisma.booking.groupBy({ by: ['status'], where: { session: sessionWhere }, _count: true }),
      this.prisma.membership.groupBy({ by: ['status'], where: b ? { member: { homeBranchId: b } } : {}, _count: true }),
      this.prisma.membership.groupBy({
        by: ['planId'],
        where: { activatedAt: { gte: r.start, lt: r.end }, ...(b ? { member: { homeBranchId: b } } : {}) },
        _count: true,
        _sum: { price: true },
      }),
      this.prisma.membershipEvent.count({
        where: {
          type: 'RENEWED',
          createdAt: { gte: r.start, lt: r.end },
          ...(b ? { membership: { member: { homeBranchId: b } } } : {}),
        },
      }),
      this.prisma.membershipEvent.count({
        where: {
          type: 'EXPIRED',
          createdAt: { gte: r.start, lt: r.end },
          ...(b ? { membership: { member: { homeBranchId: b } } } : {}),
        },
      }),
      this.prisma.lead.groupBy({
        by: ['source', 'status'],
        where: { createdAt: { gte: r.start, lt: r.end }, ...(b ? { OR: [{ branchId: b }, { branchId: null }] } : {}) },
        _count: true,
      }),
      this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT "localDate" AS day, COUNT(*)::bigint AS count FROM "CheckIn"
        WHERE status = 'ACCEPTED' AND "localDate" >= ${keyToDbDate(r.from)} AND "localDate" <= ${keyToDbDate(r.to)}
          AND (${b}::text IS NULL OR "branchId" = ${b})
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ week: Date; count: bigint }[]>`
        SELECT date_trunc('week', first_at AT TIME ZONE ${CLUB_TIMEZONE}) AS week, COUNT(*)::bigint AS count FROM (
          SELECT ms."memberId", MIN(ms."activatedAt") AS first_at FROM "Membership" ms
          JOIN "Member" m ON m.id = ms."memberId"
          WHERE ms."activatedAt" IS NOT NULL AND (${b}::text IS NULL OR m."homeBranchId" = ${b})
          GROUP BY ms."memberId"
        ) f WHERE first_at >= ${r.start} AND first_at < ${r.end}
        GROUP BY 1 ORDER BY 1`,
      finance
        ? this.prisma.payment.groupBy({
            by: ['method'],
            where: {
              status: { in: [...CAPTURED] },
              paidAt: { gte: r.start, lt: r.end },
              ...(r.includeTest ? {} : { isTest: false }),
              ...(b ? { member: { homeBranchId: b } } : {}),
            },
            _sum: { amount: true },
            _count: true,
          })
        : Promise.resolve([]),
    ]);

    const plans = await this.prisma.membershipPlan.findMany({
      where: { id: { in: salesByPlan.map((s) => s.planId) } },
      select: { id: true, name: true, code: true, type: true },
    });
    const count = (status: string) => bookingStatus.find((s) => s.status === status)?._count ?? 0;
    const capacity = sessions.reduce((s, x) => s + x.capacity, 0);
    const seats = sessions.reduce((s, x) => s + x.bookedCount, 0);
    const attended = count('ATTENDED');
    const noShow = count('NO_SHOW');

    const popularity = new Map<
      string,
      { name: unknown; slug: string; sessions: number; seats: number; capacity: number }
    >();
    for (const s of sessions) {
      const p = popularity.get(s.classTypeId) ?? {
        name: s.classType.name,
        slug: s.classType.slug,
        sessions: 0,
        seats: 0,
        capacity: 0,
      };
      p.sessions += 1;
      p.seats += s.bookedCount;
      p.capacity += s.capacity;
      popularity.set(s.classTypeId, p);
    }
    const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ seats: 0, capacity: 0 })));
    for (const s of sessions) {
      const local = new Date(s.startsAt.getTime() + tzOffsetMinutes(s.startsAt) * 60_000);
      const wd = (local.getUTCDay() + 6) % 7;
      const cell = heat[wd]![local.getUTCHours()]!;
      cell.seats += s.bookedCount;
      cell.capacity += s.capacity;
    }

    const leadTotals = {
      total: 0,
      won: 0,
      lost: 0,
      bySource: {} as Record<string, { total: number; won: number }>,
      byStatus: {} as Record<string, number>,
    };
    for (const row of leads) {
      leadTotals.total += row._count;
      leadTotals.byStatus[row.status] = (leadTotals.byStatus[row.status] ?? 0) + row._count;
      const src = (leadTotals.bySource[row.source] ??= { total: 0, won: 0 });
      src.total += row._count;
      if (row.status === 'WON') {
        src.won += row._count;
        leadTotals.won += row._count;
      }
      if (row.status === 'LOST') leadTotals.lost += row._count;
    }

    return {
      range: { from: r.from, to: r.to, includeTest: r.includeTest },
      revenue: finance
        ? {
            totals: await this.revenue(r.start, r.end, r.includeTest, b),
            series: await this.revenueSeries(r.start, r.end, r.includeTest, b),
            byMethod: byMethod.map((m) => ({ method: m.method, amount: m._sum.amount ?? 0, count: m._count })),
          }
        : null,
      membershipSales: salesByPlan
        .map((s) => ({
          plan: plans.find((p) => p.id === s.planId) ?? null,
          count: s._count,
          amount: finance ? (s._sum.price ?? 0) : null,
        }))
        .sort((a, b2) => b2.count - a.count),
      membershipStatus: Object.fromEntries(statusBreakdown.map((s) => [s.status, s._count])),
      renewal: {
        renewed: renewals,
        expired: expiries,
        rate: renewals + expiries ? renewals / (renewals + expiries) : null,
      },
      acquisition: acquisition.map((a) => ({ week: a.week.toISOString().slice(0, 10), count: Number(a.count) })),
      utilization: {
        sessions: sessions.length,
        seats,
        capacity,
        rate: capacity ? seats / capacity : null,
        heatmap: heat,
      },
      attendance: {
        attended,
        noShow,
        lateCancelled: count('LATE_CANCELLED'),
        cancelled: count('CANCELLED'),
        rate: attended + noShow ? attended / (attended + noShow) : null,
        checkIns: checkinSeries.map((c) => ({ date: c.day.toISOString().slice(0, 10), count: Number(c.count) })),
      },
      classPopularity: [...popularity.values()]
        .map((p) => ({ ...p, fillRate: p.capacity ? p.seats / p.capacity : null }))
        .sort((a, b2) => b2.seats - a.seats),
      leads: { ...leadTotals, conversionRate: leadTotals.total ? leadTotals.won / leadTotals.total : null },
      definitions: METRIC_DEFINITIONS,
    };
  }
}
