import { Prisma } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** تحويل Prisma.Decimal و Date إلى قيم JSON آمنة */
export function jsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return Number.parseFloat(value.toString());
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

export function ok<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ data: jsonSafe(data) });
}

/** غلاف للأخطاء غير المتزامنة (Express 5 كيديرها وحدو، ولكن صريح أوضح) */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** قراءة رقم من الـquery بشكل آمن */
export function qInt(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

export function paging(req: Request) {
  const page = qInt(req.query.page, 1, 1, 100000);
  const pageSize = qInt(req.query.pageSize, 20, 1, 200);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
