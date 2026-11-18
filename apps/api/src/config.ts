import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET قصير جداً'),
  SESSION_DAYS: z.coerce.number().int().positive().default(7),
  /** عدد الوكلاء (proxies) الموثوقين أمام التطبيق. 0 = التطبيق مكشوف مباشرة.
   *  لا ترفعه إلا إذا كان هناك وكيل حقيقي يعيد كتابة X-Forwarded-For. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  APP_ORIGIN: z.string().default('http://localhost:5173'),

  GOLD_PRICE_PROVIDER: z.enum(['manual', 'api']).default('manual'),
  GOLD_PRICE_API_URL: z.string().default('https://goldapi.dev/api/v1'),
  GOLD_PRICE_API_KEY: z.string().optional(),
  /** فاصل التحديث التلقائي لسعر الأونصة بالدقائق — 0 يعطّل التحديث التلقائي */
  GOLD_PRICE_REFRESH_MINUTES: z.coerce.number().int().min(0).max(1440).default(10),

  FX_PROVIDER: z.enum(['manual', 'api']).default('manual'),
  FX_API_URL: z.string().optional(),
  FX_API_KEY: z.string().optional(),

  LOCAL_CURRENCY: z.string().default('LYD'),

  /** مجلد النسخ الاحتياطية (افتراضياً backups/ في جذر المشروع) */
  BACKUP_DIR: z.string().optional(),
  /** مجلد إضافي تُنسخ إليه كل نسخة (قرص خارجي / مجلد سحابي) — اختياري */
  BACKUP_COPY_DIR: z.string().optional(),
  /** مسار mysqldump إن لم يُعثر عليه تلقائياً */
  BACKUP_MYSQLDUMP_PATH: z.string().optional(),
  /** off = تعطيل المجدول من البيئة (النسخ اليدوي يبقى متاحاً) */
  BACKUP_SCHEDULER: z.enum(['on', 'off']).default('on'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('✗ إعدادات البيئة غير صالحة:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
};
