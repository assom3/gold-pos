import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

/**
 * تنظيف محدود: لا نمسح كل الخريطة في كل طلب.
 * عند تجاوز الحد نحذف المنتهية، ثم الأقدم إدراجاً إن لزم.
 */
function sweep(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}

/** حد بسيط في الذاكرة لمحاولات تسجيل الدخول وجلب الأسعار */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  key: (req: Request) => string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = options.key(req);

    sweep(now);

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return next(
        new AppError(429, 'RATE_LIMITED', 'محاولات كثيرة جداً، الرجاء المحاولة لاحقاً'),
      );
    }
    return next();
  };
}

/** تصفير عدّاد بعد نجاح العملية (مثلاً تسجيل دخول ناجح) */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

export function loginIpKey(req: Request): string {
  return `login-ip:${req.ip ?? 'unknown'}`;
}

export function loginUserKey(req: Request): string {
  const username = (req.body as { username?: unknown } | undefined)?.username;
  return `login-user:${String(username ?? '').trim().toLowerCase() || 'unknown'}`;
}

/** حد عام لكل عنوان IP — يمنع تخمين كلمات المرور وتخفيف الضغط على الخادم */
export const loginIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  key: loginIpKey,
});

/** حد لكل حساب — لا يمكن تجاوز IP واحد لتخمين حساب معيّن */
export const loginAccountLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  key: loginUserKey,
});

/** حد جلب الأسعار من المزوّد الخارجي — يحمي الحصة اليومية للمفتاح */
export const priceFetchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  key: (req) => `price-fetch:${req.user?.id ?? req.ip ?? 'unknown'}`,
});
