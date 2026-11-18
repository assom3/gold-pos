/** خطأ تطبيقي مع رمز وحالة HTTP — كل الأخطاء كتخرج من هنا باش الردود تكون موحدة */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'يجب تسجيل الدخول') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'ليست لديك صلاحية لهذه العملية') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'العنصر غير موجود') =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

export const badGateway = (message = 'تعذر الاتصال بالخدمة الخارجية') =>
  new AppError(502, 'BAD_GATEWAY', message);
