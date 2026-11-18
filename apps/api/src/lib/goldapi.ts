import { config } from '../config.js';
import { badGateway, badRequest } from './errors.js';

/** رابط توثيق المزوّد — معروض في واجهة الأسعار */
export const GOLDAPI_DOCS_URL = 'https://goldapi.dev/docs';

export interface OunceQuote {
  /** سعر الأونصة بالدولار كما رجعه المزوّد */
  price: number;
  /** وقت تحديث السعر عند المزوّد (إن وُجد) */
  updatedAt: string | null;
  /** عنوان الطلب المستعمل — بدون المفتاح */
  sourceUrl: string;
}

export function isGoldApiConfigured(): boolean {
  return Boolean(config.GOLD_PRICE_API_KEY && config.GOLD_PRICE_API_URL);
}

/**
 * جلب سعر أونصة الذهب بالدولار من goldapi.dev.
 * GET {base}/price/XAU/USD مع ترويسة X-API-Key.
 * التوثيق: https://goldapi.dev/docs
 */
export async function fetchOunceUsd(): Promise<OunceQuote> {
  if (!isGoldApiConfigured()) {
    throw badRequest('مزوّد أسعار الذهب غير مهيأ — أضف GOLD_PRICE_API_KEY في إعدادات الخادم');
  }

  const base = config.GOLD_PRICE_API_URL.replace(/\/+$/, '');
  const sourceUrl = `${base}/price/XAU/USD`;

  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      headers: {
        'X-API-Key': config.GOLD_PRICE_API_KEY!,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw badGateway('تعذر الاتصال بمزوّد أسعار الذهب. تحقق من اتصال الإنترنت ثم حاول مجدداً.');
  }

  if (response.status === 401 || response.status === 403) {
    throw badGateway('رفض المزوّد مفتاح API — تحقق من صحة المفتاح في إعدادات الخادم.');
  }
  if (response.status === 429) {
    throw badGateway('تجاوزت حد الطلبات المسموح عند المزوّد. انتظر قليلاً ثم حاول مجدداً.');
  }
  if (!response.ok) {
    throw badGateway(`مزوّد الأسعار أعاد خطأ (${response.status}). حاول مجدداً لاحقاً.`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw badGateway('استجابة مزوّد الأسعار غير صالحة.');
  }

  const record = (data ?? {}) as Record<string, unknown>;
  const price = Number(record.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw badGateway('لم يُرجع المزوّد سعراً صالحاً للأونصة.');
  }

  // نفس حدود الإدخال اليدوي (BR-15) للحماية من القيم الشاذة
  if (price < 100 || price > 100_000) {
    throw badGateway('سعر الأونصة القادم من المزوّد خارج النطاق المنطقي.');
  }

  return {
    price,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    sourceUrl,
  };
}
