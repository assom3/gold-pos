import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@prisma/client';
import { forbidden, unauthorized } from '../lib/errors.js';
import { SESSION_COOKIE, resolveSession } from './session.js';

/** كيحمّل المستخدم من الجلسة إن كانت موجودة (بلا إجبار) */
export const attachUser: RequestHandler = async (req, _res, next) => {
  try {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    req.user = (await resolveSession(token)) ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
};

/** كل المسارات اللي كتحتاج تسجيل دخول */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}
