import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ah, ok } from '../lib/http.js';
import { AppError, badRequest, unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import {
  loginAccountLimiter,
  loginIpKey,
  loginIpLimiter,
  loginUserKey,
  resetRateLimit,
} from '../middleware/rateLimit.js';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  destroyOtherUserSessions,
  destroySession,
  setSessionCookie,
} from '../auth/session.js';
import { requireAuth } from '../auth/middleware.js';
import { DUMMY_PASSWORD_HASH, assertPasswordPolicy } from '../lib/password.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, 'اسم المستخدم مطلوب').max(60),
  password: z.string().min(1, 'كلمة المرور مطلوبة').max(200),
});

authRouter.post(
  '/login',
  loginIpLimiter,
  loginAccountLimiter,
  ah(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { username } });
    // مقارنة ثابتة الزمن تقريباً: حتى إذا لم يوجد المستخدم نقارن بهاش وهمي صالح
    const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const valid = await bcrypt.compare(password, hash);

    if (!user || !valid || !user.active) {
      throw unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    // نجاح الدخول يصفّر عدّادات الحساب وهذا العنوان
    resetRateLimit(loginIpKey(req));
    resetRateLimit(loginUserKey(req));

    // تنظيم الجلسات: لا نترك جلسة قديمة لنفس المتصفح، ونحذف المنتهية
    const previousToken = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (previousToken) await destroySession(previousToken);
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);

    const { token, expiresAt } = await createSession(user.id, req);
    setSessionCookie(res, token, expiresAt);

    await audit({ userId: user.id, action: 'LOGIN', entity: 'user', entityId: user.id });

    return ok(res, {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    });
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    await destroySession(token);
    clearSessionCookie(res);
    return ok(res, { ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => ok(res, req.user)),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل').max(200),
});

authRouter.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

    // لا نستعمل 401 هنا: الواجهة تعتبره انتهاء جلسة وتُخرج المستخدم من النظام
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new AppError(400, 'WRONG_PASSWORD', 'كلمة المرور الحالية غير صحيحة');

    assertPasswordPolicy(newPassword, user.username);
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw badRequest('كلمة المرور الجديدة مطابقة للحالية، اختر كلمة مختلفة');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    const currentToken = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    await destroyOtherUserSessions(user.id, currentToken);

    await audit({ userId: user.id, action: 'CHANGE_PASSWORD', entity: 'user', entityId: user.id });
    return ok(res, { ok: true });
  }),
);
