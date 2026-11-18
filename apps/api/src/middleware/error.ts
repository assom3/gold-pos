import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, badRequest } from '../lib/errors.js';
import { config } from '../config.js';
import { PricingError } from '@gold/pricing';

/**
 * كل رسالة تصل للمستخدم هنا عربية ومختصرة.
 * التفاصيل التقنية (الإنجليزية) تُكتب في سجل الخادم فقط،
 * مع رقم مرجعي يساعد المسؤول على تتبع الخطأ.
 */

const PRISMA_CONNECTION_CODES = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1010', 'P1017']);
const PRISMA_SCHEMA_CODES = new Set(['P2021', 'P2022', 'P3005']);

function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    code: 'كود الصنف',
    name: 'الاسم',
    username: 'اسم الدخول',
    invoiceNo: 'رقم الفاتورة',
    value: 'القيمة',
    kind: 'نوع القائمة',
    id: 'المعرّف',
  };
  return map[field] ?? field;
}

function duplicateMessage(err: Prisma.PrismaClientKnownRequestError): string {
  const model = String((err.meta as { modelName?: string } | undefined)?.modelName ?? '');
  const targetRaw = (err.meta as { target?: unknown } | undefined)?.target;
  const target = Array.isArray(targetRaw)
    ? targetRaw.map(String)
    : typeof targetRaw === 'string'
      ? [targetRaw]
      : [];

  if (model === 'Item' || target.includes('code')) {
    return 'كود الصنف مستخدم مسبقاً. اتركه فارغاً ليُولَّد تلقائياً، أو اختر كوداً آخر.';
  }
  if (model === 'User' || target.includes('username')) {
    return 'اسم الدخول مستخدم مسبقاً. اختر اسماً آخر.';
  }
  if (model === 'Sale' || target.includes('invoiceNo')) {
    return 'رقم الفاتورة مستخدم مسبقاً. أعد المحاولة.';
  }
  if (model === 'Lookup') {
    return 'هذه القيمة موجودة مسبقاً في القائمة.';
  }
  return 'هذه القيمة موجودة مسبقاً، لا يمكن تكرارها.';
}

function prismaMessage(err: Prisma.PrismaClientKnownRequestError): { status: number; code: string; message: string } {
  if (err.code === 'P2002') {
    return { status: 409, code: 'DUPLICATE', message: duplicateMessage(err) };
  }
  if (err.code === 'P2025') {
    return { status: 404, code: 'NOT_FOUND', message: 'العنصر المطلوب غير موجود أو تم حذفه.' };
  }
  if (err.code === 'P2003' || err.code === 'P2014') {
    return {
      status: 409,
      code: 'RELATION_CONFLICT',
      message: 'لا يمكن تنفيذ العملية لوجود بيانات مرتبطة بهذا العنصر.',
    };
  }
  if (err.code === 'P2011') {
    return { status: 400, code: 'REQUIRED_FIELD', message: 'يوجد حقل مطلوب فارغ. أكمل البيانات ثم أعد المحاولة.' };
  }
  if (err.code === 'P2000') {
    return { status: 400, code: 'VALUE_TOO_LONG', message: 'إحدى القيم أطول من المسموح. اختصرها ثم أعد المحاولة.' };
  }
  if (PRISMA_CONNECTION_CODES.has(err.code)) {
    return {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'تعذر الاتصال بقاعدة البيانات. تأكد من تشغيل خدمة قاعدة البيانات ثم أعد المحاولة.',
    };
  }
  if (PRISMA_SCHEMA_CODES.has(err.code)) {
    return {
      status: 503,
      code: 'DATABASE_NOT_READY',
      message: 'قاعدة البيانات غير مهيأة بالشكل المطلوب. شغّل تحديث قاعدة البيانات ثم أعد المحاولة.',
    };
  }
  return {
    status: 500,
    code: 'DATABASE_ERROR',
    message: 'تعذر إكمال العملية بسبب خطأ في قاعدة البيانات. أعد المحاولة، وإذا تكرر الخطأ تواصل مع المسؤول.',
  };
}

function looksLikeConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const text = `${err.name} ${err.message}`;
  return (
    /PrismaClientInitializationError|PrismaClientRustPanicError|PrismaClientUnknownRequestError/i.test(text) ||
    /Can't reach database server|ECONNREFUSED|ETIMEDOUT|connect ECONN|Connection refused|Access denied for user/i.test(text)
  );
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `المسار المطلوب غير موجود (${req.method}).`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);

  const send = (status: number, code: string, message: string, details?: unknown) => {
    if (res.headersSent) return;
    res.status(status).json({
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
        requestId,
      },
    });
  };

  // 1) أخطاء التحقق من المدخلات
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message || 'قيمة غير صالحة',
    }));
    const first = details[0]?.message;
    send(422, 'VALIDATION_ERROR', first || 'بعض البيانات المدخلة غير صالحة. راجع الحقول المطلوبة.', details);
    return;
  }

  // 2) أخطاء محرك التسعير (رسائلها عربية أصلاً)
  if (err instanceof PricingError) {
    send(422, err.code, err.message || 'تعذر حساب السعر بهذه البيانات.', err.details);
    return;
  }

  // 3) أخطاء قاعدة البيانات المعروفة
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = prismaMessage(err);
    console.error(`[db:${err.code}] [${requestId}] ${req.method} ${req.originalUrl}`);
    console.error(err.message);
    send(mapped.status, mapped.code, mapped.message);
    return;
  }

  // 4) تعذر الاتصال بقاعدة البيانات / أخطاء تشغيل Prisma
  if (looksLikeConnectionError(err)) {
    console.error(`[db:connection] [${requestId}] ${req.method} ${req.originalUrl}`);
    console.error((err as Error).message);
    send(
      503,
      'DATABASE_UNAVAILABLE',
      'تعذر الاتصال بقاعدة البيانات. تأكد من تشغيل خدمة قاعدة البيانات ثم أعد المحاولة.',
    );
    return;
  }

  // 5) أخطاء التطبيق المخططة
  if (err instanceof AppError) {
    send(err.status, err.code, err.message, err.details);
    return;
  }

  // 6) أخطاء JSON / حجم الطلب
  const anyErr = err as { type?: string; status?: number; message?: string };
  if (anyErr?.type === 'entity.parse.failed') {
    send(400, 'INVALID_JSON', 'صيغة البيانات المرسلة غير صحيحة.');
    return;
  }
  if (anyErr?.type === 'entity.too.large') {
    send(413, 'PAYLOAD_TOO_LARGE', 'حجم البيانات المرسل كبير جداً. اختصر المحتوى ثم أعد المحاولة.');
    return;
  }

  // 7) أي خطأ آخر — رسالة عربية فقط، والتفاصيل للسجل
  console.error(`[unhandled] [${requestId}] ${req.method} ${req.originalUrl}`);
  console.error(err);
  send(
    500,
    'INTERNAL',
    'حدث خطأ غير متوقع. أعد المحاولة، وإذا تكرر الخطأ فأبلغ المسؤول مع رقم المرجع.',
  );
};

/** منع الطلبات المعدِّلة من أصول غير مسموحة (حماية CSRF إضافية) */
export const originGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next(); // نفس الأصل أو أدوات CLI
  if (origin === 'null') return next(badRequest('أصل الطلب غير مسموح.'));

  const allowed = new Set(
    process.env.NODE_ENV === 'production'
      ? [process.env.APP_ORIGIN ?? 'http://localhost:5173']
      : [
          process.env.APP_ORIGIN ?? 'http://localhost:5173',
          `http://localhost:${process.env.PORT ?? 4000}`,
          `http://127.0.0.1:${process.env.PORT ?? 4000}`,
          'http://localhost:5173',
          'http://127.0.0.1:5173',
        ],
  );
  if (!allowed.has(origin)) return next(badRequest('أصل الطلب غير مسموح.'));
  return next();
};
