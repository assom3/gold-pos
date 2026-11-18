import { z } from 'zod';

/**
 * تعريب رسائل التحقق الافتراضية (zod v4 locales)
 * ملاحظة: الرسائل المخصصة فالسكيما عندها الأولوية على هادي.
 */
z.config(z.locales.ar());

export { z };
