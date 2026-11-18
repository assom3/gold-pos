export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** رسالة صالحة للعرض للمستخدم */
  get displayMessage(): string {
    if (this.code === 'VALIDATION_ERROR' && Array.isArray(this.details)) {
      const first = this.details[0] as { path?: string; message?: string } | undefined;
      if (first?.message) return first.message;
    }
    return this.message;
  }
}

const BASE = '/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'تعذر الاتصال بالخادم، تحقق من الشبكة');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const payload = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const error = new ApiError(
      res.status,
      payload?.code ?? 'ERROR',
      payload?.message ?? 'حدث خطأ غير متوقع',
      payload?.details,
    );
    // فقط انتهاء الجلسة الفعلي يُخرج المستخدم؛ أي 401 آخر (كلمة مرور خاطئة مثلاً) يُعرض كخطأ عادي
    if (res.status === 401 && error.code === 'UNAUTHORIZED' && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw error;
  }

  return (json as { data: T } | null)?.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}
