import { prisma } from '../db.js';
import { config } from '../config.js';
import { audit } from './audit.js';
import { fetchOunceUsd, isGoldApiConfigured } from './goldapi.js';

/**
 * تحديث سعر الأونصة تلقائياً من goldapi.dev.
 *
 * الخطة المجانية عند goldapi.dev = 100 طلب/ساعة.
 * القيمة الافتراضية 10 دقائق = 6 طلبات/ساعة فقط، أي أقل بكثير من الحد.
 * يمكن تغيير الفاصل أو تعطيل التحديث التلقائي عبر GOLD_PRICE_REFRESH_MINUTES.
 */

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

export function isAutoRefreshEnabled(): boolean {
  return (
    config.GOLD_PRICE_PROVIDER === 'api' &&
    config.GOLD_PRICE_REFRESH_MINUTES > 0 &&
    isGoldApiConfigured()
  );
}

async function refreshOnce(reason: 'startup' | 'schedule'): Promise<void> {
  if (inFlight) return;
  inFlight = true;

  try {
    const [owner, last] = await Promise.all([
      prisma.user.findFirst({ where: { role: 'OWNER', active: true }, orderBy: { id: 'asc' } }),
      prisma.priceUpdate.findFirst({ where: { type: 'OUNCE' }, orderBy: { createdAt: 'desc' } }),
    ]);

    if (!owner) {
      console.warn('[price] لا يوجد مالك نشط لتسجيل تحديث السعر التلقائي');
      return;
    }

    // عند الإقلاع لا نُكرّر الجلب إذا كان آخر تحديث ما زال داخل الفاصل.
    if (reason === 'startup' && last) {
      const ageMs = Date.now() - last.createdAt.getTime();
      if (ageMs < config.GOLD_PRICE_REFRESH_MINUTES * 60_000) return;
    }

    const quote = await fetchOunceUsd();
    const row = await prisma.priceUpdate.create({
      data: {
        type: 'OUNCE',
        value: quote.price,
        source: 'API',
        userId: owner.id,
      },
    });

    await audit({
      userId: owner.id,
      action: 'AUTO_FETCH_PRICE',
      entity: 'price',
      entityId: row.id,
      newValue: {
        type: 'OUNCE',
        value: quote.price,
        source: 'API',
        provider: 'goldapi.dev',
        providerUpdatedAt: quote.updatedAt,
        sourceUrl: quote.sourceUrl,
        reason,
      },
    });

    console.log(`[price] تحديث تلقائي: $${quote.price} (${reason})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[price] فشل التحديث التلقائي: ${message}`);
  } finally {
    inFlight = false;
  }
}

export function startPriceScheduler(): void {
  if (!isAutoRefreshEnabled()) {
    console.log('[price] التحديث التلقائي لسعر الأونصة معطّل');
    return;
  }

  const everyMs = config.GOLD_PRICE_REFRESH_MINUTES * 60_000;
  console.log(`[price] التحديث التلقائي كل ${config.GOLD_PRICE_REFRESH_MINUTES} دقيقة`);

  void refreshOnce('startup');
  timer = setInterval(() => void refreshOnce('schedule'), everyMs);
  timer.unref?.();
}

export function stopPriceScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
