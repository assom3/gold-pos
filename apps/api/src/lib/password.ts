import bcrypt from 'bcryptjs';
import { badRequest } from './errors.js';

/**
 * هاش وهمي صالح (60 حرفاً) لمقارنة ثابتة الزمن تقريباً عند محاولة
 * تسجيل دخول باسم مستخدم غير موجود — يمنع كشف الحسابات عبر التوقيت.
 */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('gold-pos-dummy-password', 12);

const WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
  'admin1234',
  'seller123',
  'iloveyou',
]);

/**
 * سياسة كلمة المرور: 8 أحرف على الأقل، دون تجاوز حد bcrypt (72 بايت)،
 * وألا تكون مطابقة لاسم المستخدم أو من الكلمات الشائعة.
 */
export function assertPasswordPolicy(password: string, username?: string): void {
  if (password.length < 8) {
    throw badRequest('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  }
  if (bcrypt.truncates(password)) {
    throw badRequest('كلمة المرور طويلة جداً، استعمل 72 حرفاً أو أقل');
  }
  const lower = password.toLowerCase();
  const user = username?.trim().toLowerCase();
  if (user && user.length >= 3 && lower.includes(user)) {
    throw badRequest('كلمة المرور لا يجب أن تحتوي اسم المستخدم');
  }
  if (WEAK_PASSWORDS.has(lower)) {
    throw badRequest('كلمة المرور شائعة جداً، اختر كلمة أقوى');
  }
}
