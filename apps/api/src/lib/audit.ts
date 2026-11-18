import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../db.js';

export interface AuditEntry {
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  oldValue?: unknown;
  newValue?: unknown;
}

/** تسجيل كل تعديل مهم (تقارير / سجل التعديلات — القسم 7 و 11) */
export async function audit(entry: AuditEntry, tx: Tx | typeof prisma = prisma) {
  await tx.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId === null || entry.entityId === undefined ? null : String(entry.entityId),
      oldValue: toJson(entry.oldValue),
      newValue: toJson(entry.newValue),
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
