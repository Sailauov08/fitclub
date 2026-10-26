import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/auth-context';

const SENSITIVE_KEYS = /password|token|secret|hash|card|cvv|iban/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[redacted]' : scrub(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Append-only record of administrative actions. Metadata is scrubbed of secrets. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(actor: Pick<AuthUser, 'id'> | null, entry: AuditEntry, opts: { tx?: Tx; ip?: string } = {}) {
    const client = opts.tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          actorId: actor?.id ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          branchId: entry.branchId ?? null,
          metadata: entry.metadata ? (scrub(entry.metadata) as Prisma.InputJsonValue) : Prisma.JsonNull,
          ip: opts.ip?.slice(0, 64),
        },
      });
    } catch (error) {
      if (opts.tx) throw error;
      this.logger.error({ err: error, entry: entry.action }, 'Failed to write audit log');
    }
  }
}
