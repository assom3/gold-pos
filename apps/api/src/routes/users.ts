import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { ah, ok } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { destroyAllUserSessions } from '../auth/session.js';
import { assertPasswordPolicy } from '../lib/password.js';

export const usersRouter = Router();

const createSchema = z.object({
  name: z.string().trim().min(2, 'الاسم مطلوب').max(160),
  username: z
    .string()
    .trim()
    .min(3, 'اسم الدخول قصير')
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, 'اسم الدخول يقبل حروفاً لاتينية وأرقاماً فقط'),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل').max(200),
  role: z.enum(['OWNER', 'SELLER']),
  active: z.boolean().optional(),
});

usersRouter.get(
  '/',
  ah(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, username: true, role: true, active: true, createdAt: true },
    });
    return ok(res, users);
  }),
);

usersRouter.post(
  '/',
  ah(async (req, res) => {
    const body = createSchema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { username: body.username } });
    if (exists) throw conflict('اسم الدخول مستعمل مسبقاً');

    assertPasswordPolicy(body.password, body.username);
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        username: body.username,
        passwordHash,
        role: body.role as Role,
        active: body.active ?? true,
      },
      select: { id: true, name: true, username: true, role: true, active: true, createdAt: true },
    });

    await audit({
      userId: req.user!.id,
      action: 'CREATE_USER',
      entity: 'user',
      entityId: user.id,
      newValue: { username: user.username, role: user.role },
    });

    return ok(res, user, 201);
  }),
);

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  role: z.enum(['OWNER', 'SELLER']).optional(),
  active: z.boolean().optional(),
});

usersRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const body = updateSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound('المستخدم غير موجود');

    // منع تعطيل آخر مالك نشط
    if ((body.active === false || body.role === 'SELLER') && existing.role === 'OWNER') {
      const owners = await prisma.user.count({ where: { role: 'OWNER', active: true, id: { not: id } } });
      if (owners === 0) throw badRequest('لا يمكن تعطيل آخر مالك للنظام');
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.role !== undefined ? { role: body.role as Role } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
      select: { id: true, name: true, username: true, role: true, active: true, createdAt: true },
    });

    if (body.active === false) await destroyAllUserSessions(id);

    await audit({
      userId: req.user!.id,
      action: 'UPDATE_USER',
      entity: 'user',
      entityId: id,
      oldValue: { name: existing.name, role: existing.role, active: existing.active },
      newValue: { name: user.name, role: user.role, active: user.active },
    });

    return ok(res, user);
  }),
);

const passwordSchema = z.object({
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل').max(200),
});

usersRouter.post(
  '/:id/password',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const { password } = passwordSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('المستخدم غير موجود');

    assertPasswordPolicy(password, target.username);
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    await destroyAllUserSessions(id);

    await audit({ userId: req.user!.id, action: 'RESET_PASSWORD', entity: 'user', entityId: id });
    return ok(res, { ok: true });
  }),
);
