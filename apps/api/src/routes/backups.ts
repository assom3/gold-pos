import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ah, ok } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import {
  INTERVAL_OPTIONS,
  deleteBackup,
  getBackupOverview,
  getBackupSetting,
  resolveDownload,
  runBackup,
} from '../lib/backup.js';

/** كل مسارات النسخ الاحتياطي للمالك فقط (تُركَّب في app.ts مع requireRole('OWNER')) */
export const backupsRouter = Router();

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  intervalHours: z
    .number()
    .refine((v) => (INTERVAL_OPTIONS as readonly number[]).includes(v), 'الفاصل الزمني غير مدعوم')
    .optional(),
  timeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'الوقت يجب أن يكون بصيغة HH:MM')
    .optional(),
  retentionCount: z.number().int().min(3, 'احتفظ بثلاث نسخ على الأقل').max(90, 'الحد الأقصى 90 نسخة').optional(),
});

backupsRouter.get(
  '/',
  ah(async (_req, res) => ok(res, await getBackupOverview())),
);

backupsRouter.patch(
  '/settings',
  ah(async (req, res) => {
    const body = settingsSchema.parse(req.body);
    const current = await getBackupSetting();

    await prisma.backupSetting.update({
      where: { id: 1 },
      data: {
        enabled: body.enabled,
        intervalHours: body.intervalHours,
        timeOfDay: body.timeOfDay,
        retentionCount: body.retentionCount,
      },
    });

    await audit({
      userId: req.user!.id,
      action: 'UPDATE_BACKUP_SETTINGS',
      entity: 'backup',
      entityId: 1,
      oldValue: {
        enabled: current.enabled,
        intervalHours: current.intervalHours,
        timeOfDay: current.timeOfDay,
        retentionCount: current.retentionCount,
      },
      newValue: body,
    });

    return ok(res, await getBackupOverview());
  }),
);

/** نسخة يدوية فورية — تنتظر حتى انتهاء النسخ ثم تُرجع نتيجته */
backupsRouter.post(
  '/run',
  ah(async (req, res) => {
    const run = await runBackup('MANUAL', req.user!.id);
    if (run.status === 'FAILED') {
      throw badRequest(`فشلت النسخة الاحتياطية: ${run.error ?? 'سبب غير معروف'}`);
    }
    return ok(res, await getBackupOverview(), 201);
  }),
);

backupsRouter.get(
  '/:id/download',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');
    const run = await prisma.backupRun.findUnique({ where: { id } });
    if (!run) throw notFound('سجل النسخة غير موجود');

    const file = resolveDownload(run);
    await audit({
      userId: req.user!.id,
      action: 'BACKUP_DOWNLOAD',
      entity: 'backup',
      entityId: id,
      newValue: { fileName: run.fileName },
    });
    res.download(file, run.fileName!);
  }),
);

backupsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');
    await deleteBackup(id, req.user!.id);
    return ok(res, await getBackupOverview());
  }),
);
