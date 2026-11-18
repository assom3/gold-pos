import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';

export const SESSION_COOKIE = 'gold_session';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  name: string;
  username: string;
  role: Role;
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: number, req: Request): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.SESSION_DAYS * DAY_MS);

  await prisma.session.create({
    data: {
      id: hash(token),
      userId,
      expiresAt,
      ip: req.ip ?? null,
      userAgent: (req.get('user-agent') ?? '').slice(0, 255) || null,
    },
  });

  return { token, expiresAt };
}

export async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: hash(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!session.user.active) return null;

  // تحديث آخر استعمال مرة فالساعة فقط لتقليل الكتابة
  if (Date.now() - session.lastUsedAt.getTime() > 3_600_000) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    id: session.user.id,
    name: session.user.name,
    username: session.user.username,
    role: session.user.role,
  };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.delete({ where: { id: hash(token) } }).catch(() => undefined);
}

export async function destroyAllUserSessions(userId: number): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** إبقاء جلسة الطلب الحالي وإبطال بقية جلسات المستخدم (بعد تغيير كلمة المرور) */
export async function destroyOtherUserSessions(
  userId: number,
  keepToken: string | undefined,
): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId, ...(keepToken ? { id: { not: hash(keepToken) } } : {}) },
  });
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
  });
}
