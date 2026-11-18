import { prisma } from '../db.js';

export interface PriceSnapshot {
  value: number;
  at: string;
  source: 'MANUAL' | 'API';
  userId: number;
  userName: string;
}

export interface CurrentPrices {
  ounce: PriceSnapshot | null;
  fx: PriceSnapshot | null;
  /** هل الأسعار متقادمة حسب إعداد المحل (BR-15) */
  stale: boolean;
  staleHours: number;
  /** أقدم سعر مستعمل، بالساعات */
  ageHours: number | null;
  ready: boolean;
}

async function latest(type: 'OUNCE' | 'FX'): Promise<PriceSnapshot | null> {
  const row = await prisma.priceUpdate.findFirst({
    where: { type },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true } } },
  });
  if (!row) return null;
  return {
    value: Number.parseFloat(row.value.toString()),
    at: row.createdAt.toISOString(),
    source: row.source,
    userId: row.userId,
    userName: row.user.name,
  };
}

export async function getCurrentPrices(): Promise<CurrentPrices> {
  const [ounce, fx, setting] = await Promise.all([
    latest('OUNCE'),
    latest('FX'),
    prisma.setting.findUnique({ where: { id: 1 } }),
  ]);

  const staleHours = setting?.priceStaleHours ?? 2;
  const ages: number[] = [];
  for (const p of [ounce, fx]) {
    if (p) ages.push((Date.now() - new Date(p.at).getTime()) / 3_600_000);
  }
  const ageHours = ages.length > 0 ? Math.max(...ages) : null;
  const stale = ageHours === null ? false : ageHours > staleHours;

  return {
    ounce,
    fx,
    stale,
    staleHours,
    ageHours: ageHours === null ? null : Math.round(ageHours * 100) / 100,
    ready: Boolean(ounce && fx),
  };
}
