import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { copyFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createGunzip, createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import type { BackupRun, BackupSetting, BackupTrigger } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { audit } from './audit.js';
import { AppError, conflict, notFound } from './errors.js';

/**
 * النسخ الاحتياطي لقاعدة البيانات.
 *
 * mysqldump → gzip → ملف gold_pos-YYYYMMDD-HHMMSS.sql.gz في مجلد النسخ.
 * كل محاولة تُسجَّل في BackupRun، وبعد النجاح تُتحقَّق سلامة الملف ويُطبَّق الاحتفاظ.
 */

export const INTERVAL_OPTIONS = [6, 12, 24, 48, 168] as const;
const RETRY_AFTER_FAILURE_MS = 30 * 60_000;
const DUMP_TIMEOUT_MS = 10 * 60_000;
const STALE_RUNNING_MS = 15 * 60_000;
const KEEP_FAILED_RUNS = 30;

/* ═══════════════════════ المسارات والأدوات ═══════════════════════ */

/** جذر المشروع: أقرب مجلد أعلى يحتوي apps/ و tools/ */
function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, 'apps')) && existsSync(join(dir, 'tools'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const root = findProjectRoot();

export function backupDir(): string {
  return config.BACKUP_DIR ? resolve(config.BACKUP_DIR) : join(root, 'backups');
}

function copyDir(): string | null {
  return config.BACKUP_COPY_DIR ? resolve(config.BACKUP_COPY_DIR) : null;
}

/** مسار mysqldump: المتغير ثم MySQL المحمول داخل المشروع ثم PATH */
export function findMysqldump(): { path: string; found: boolean } {
  if (config.BACKUP_MYSQLDUMP_PATH) {
    return { path: config.BACKUP_MYSQLDUMP_PATH, found: existsSync(config.BACKUP_MYSQLDUMP_PATH) };
  }
  const exe = process.platform === 'win32' ? 'mysqldump.exe' : 'mysqldump';
  const mysqlRoot = join(root, 'tools', 'mysql');
  if (existsSync(mysqlRoot)) {
    for (const entry of readdirSync(mysqlRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('mysql-')) continue;
      const candidate = join(mysqlRoot, entry.name, 'bin', exe);
      if (existsSync(candidate)) return { path: candidate, found: true };
    }
  }
  // لا يمكن التأكد من وجوده في PATH دون تشغيله؛ نجرّبه عند التنفيذ
  return { path: 'mysqldump', found: true };
}

function parseDatabaseUrl() {
  const url = new URL(config.DATABASE_URL);
  return {
    host: url.hostname || '127.0.0.1',
    port: url.port || '3306',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '').split('?')[0] ?? ''),
  };
}

function stamp(d = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

/* ═══════════════════════ الإعدادات والجدولة ═══════════════════════ */

export async function getBackupSetting(): Promise<BackupSetting> {
  return prisma.backupSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

/**
 * موعد النسخة التالية (دالة صافية قابلة للاختبار).
 * - لا نسخة ناجحة سابقة → فوراً.
 * - فاصل أقل من 24 ساعة → آخر نسخة ناجحة + الفاصل.
 * - فاصل 24 ساعة فأكثر → يوم آخر نسخة + عدد الأيام عند وقت التشغيل المحدد.
 * - بعد فشل نمهل 30 دقيقة قبل المحاولة التالية.
 */
export function computeNextRun(
  setting: Pick<BackupSetting, 'enabled' | 'intervalHours' | 'timeOfDay'>,
  lastOkAt: Date | null,
  lastFailedAt: Date | null,
  now: Date = new Date(),
): Date | null {
  if (!setting.enabled) return null;

  let next: Date;
  if (!lastOkAt) {
    next = now;
  } else if (setting.intervalHours < 24) {
    next = new Date(lastOkAt.getTime() + setting.intervalHours * 3_600_000);
  } else {
    const [hh, mm] = setting.timeOfDay.split(':').map((v) => Number(v));
    const days = Math.round(setting.intervalHours / 24);
    next = new Date(lastOkAt);
    next.setHours(hh ?? 2, mm ?? 0, 0, 0);
    next.setDate(next.getDate() + days);
  }

  if (lastFailedAt && (!lastOkAt || lastFailedAt > lastOkAt)) {
    const retryAt = new Date(lastFailedAt.getTime() + RETRY_AFTER_FAILURE_MS);
    if (retryAt > next) next = retryAt;
  }
  return next;
}

/* ═══════════════════════ التنفيذ ═══════════════════════ */

let running = false;

export function isBackupRunning(): boolean {
  return running;
}

/** يقرأ ذيل الملف المضغوط للتأكد أن mysqldump أنهى الكتابة وأن الملف سليم */
async function verifyBackupFile(file: string): Promise<void> {
  let tail = '';
  let head = '';
  let bytes = 0;
  await pipeline(
    createReadStream(file),
    createGunzip(),
    new Writable({
      write(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        if (head.length < 8192) head += chunk.toString('utf8', 0, Math.min(chunk.length, 8192));
        tail = (tail + chunk.toString('utf8')).slice(-2048);
        cb();
      },
    }),
  );
  if (bytes === 0) throw new Error('الملف فارغ');
  if (!head.includes('CREATE TABLE') && !head.includes('MySQL dump')) throw new Error('الملف لا يبدو نسخة MySQL');
  if (!tail.includes('Dump completed')) throw new Error('الملف ناقص: لم تكتمل كتابة النسخة');
}

async function dumpToFile(target: string): Promise<void> {
  const db = parseDatabaseUrl();
  const dump = findMysqldump();
  const defaultsFile = join(root, 'tools', 'mysql', 'my.ini');

  const args = [
    ...(existsSync(defaultsFile) && dump.path !== 'mysqldump' ? [`--defaults-file=${defaultsFile}`] : []),
    `--user=${db.user}`,
    `--host=${db.host}`,
    `--port=${db.port}`,
    '--protocol=TCP',
    '--single-transaction',
    '--no-tablespaces',
    '--routines',
    '--triggers',
    '--default-character-set=utf8mb4',
    db.database,
  ];

  const child = spawn(dump.path, args, {
    env: { ...process.env, MYSQL_PWD: db.password },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    if (stderr.length < 4000) stderr += chunk.toString('utf8');
  });

  const timer = setTimeout(() => child.kill(), DUMP_TIMEOUT_MS);
  const exited = new Promise<number | null>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('close', (code) => resolveExit(code));
  });

  try {
    const [, code] = await Promise.all([
      pipeline(child.stdout, createGzip({ level: 6 }), createWriteStream(target)),
      exited,
    ]);
    if (code !== 0) {
      // الأخطاء تحوي أحياناً كلمات مرور في سطر الأوامر؛ نحتفظ بأول 400 حرف فقط
      throw new Error(`mysqldump انتهى برمز ${code}: ${stderr.trim().slice(0, 400)}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new Error('أداة mysqldump غير موجودة. اضبط BACKUP_MYSQLDUMP_PATH في إعدادات الخادم.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function runBackup(trigger: BackupTrigger, userId: number | null = null): Promise<BackupRun> {
  // نرفع العلم قبل أي await حتى لا يتجاوز طلبان متزامنان الفحص معاً
  if (running) throw conflict('نسخة احتياطية قيد التنفيذ الآن، انتظر حتى تنتهي.');
  running = true;

  let run: BackupRun;
  try {
    // حماية من تشغيل خادمين على نفس القاعدة في نفس اللحظة
    const recent = await prisma.backupRun.findFirst({
      where: { status: 'RUNNING', startedAt: { gt: new Date(Date.now() - STALE_RUNNING_MS) } },
    });
    if (recent) throw conflict('نسخة احتياطية قيد التنفيذ الآن، انتظر حتى تنتهي.');
    run = await prisma.backupRun.create({ data: { trigger, status: 'RUNNING', userId } });
  } catch (err) {
    running = false;
    throw err;
  }
  const dir = backupDir();
  const fileName = `gold_pos-${stamp()}.sql.gz`;
  const finalPath = join(dir, fileName);
  const partialPath = `${finalPath}.partial`;

  try {
    mkdirSync(dir, { recursive: true });
    await dumpToFile(partialPath);
    await verifyBackupFile(partialPath);
    await rename(partialPath, finalPath);
    const size = (await stat(finalPath)).size;

    // نسخة إضافية اختيارية إلى قرص خارجي/مجلد سحابي: فشلها تحذير لا يُفشل النسخة
    let warning: string | null = null;
    const extra = copyDir();
    if (extra) {
      try {
        mkdirSync(extra, { recursive: true });
        await copyFile(finalPath, join(extra, fileName));
      } catch (err) {
        warning = `نُسخت النسخة محلياً لكن تعذر نسخها إلى المجلد الإضافي: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500);
      }
    }

    const done = await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: 'OK', finishedAt: new Date(), fileName, sizeBytes: BigInt(size), error: warning },
    });
    await audit({
      userId,
      action: trigger === 'MANUAL' ? 'BACKUP_MANUAL' : 'BACKUP_SCHEDULED',
      entity: 'backup',
      entityId: run.id,
      newValue: { fileName, sizeBytes: size, ...(warning ? { warning } : {}) },
    });
    await applyRetention().catch((err) => console.warn('[backup] تعذر تطبيق الاحتفاظ:', err));
    return done;
  } catch (err) {
    await unlink(partialPath).catch(() => undefined);
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 900);
    console.error('[backup] فشلت النسخة الاحتياطية:', message);
    const failed = await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: message },
    });
    await audit({ userId, action: 'BACKUP_FAILED', entity: 'backup', entityId: run.id, newValue: { error: message } }).catch(
      () => undefined,
    );
    return failed;
  } finally {
    running = false;
  }
}

/* ═══════════════════════ الاحتفاظ والحذف ═══════════════════════ */

function filePathFor(fileName: string): string {
  // اسم الملف يأتي من السجل لا من المستخدم، ونتحقق من صيغته منعاً لأي خروج من المجلد
  if (!/^gold_pos-\d{8}-\d{6}\.sql\.gz$/.test(fileName)) throw new AppError(400, 'BAD_FILE', 'اسم ملف النسخة غير صالح');
  return join(backupDir(), fileName);
}

async function removeFiles(fileName: string): Promise<void> {
  await unlink(filePathFor(fileName)).catch(() => undefined);
  const extra = copyDir();
  if (extra) await unlink(join(extra, fileName)).catch(() => undefined);
}

export async function applyRetention(): Promise<number> {
  const setting = await getBackupSetting();
  let removed = 0;

  const okRuns = await prisma.backupRun.findMany({
    where: { status: 'OK' },
    orderBy: { startedAt: 'desc' },
    skip: setting.retentionCount,
  });
  for (const run of okRuns) {
    if (run.fileName) await removeFiles(run.fileName);
    await prisma.backupRun.delete({ where: { id: run.id } });
    removed += 1;
  }

  const oldFailed = await prisma.backupRun.findMany({
    where: { status: 'FAILED' },
    orderBy: { startedAt: 'desc' },
    skip: KEEP_FAILED_RUNS,
    select: { id: true },
  });
  if (oldFailed.length > 0) {
    await prisma.backupRun.deleteMany({ where: { id: { in: oldFailed.map((r) => r.id) } } });
  }
  return removed;
}

export async function deleteBackup(id: number, userId: number): Promise<void> {
  const run = await prisma.backupRun.findUnique({ where: { id } });
  if (!run) throw notFound('سجل النسخة غير موجود');
  if (run.status === 'RUNNING') throw conflict('لا يمكن حذف نسخة قيد التنفيذ');
  if (run.fileName) await removeFiles(run.fileName);
  await prisma.backupRun.delete({ where: { id } });
  await audit({ userId, action: 'BACKUP_DELETE', entity: 'backup', entityId: id, oldValue: { fileName: run.fileName } });
}

export function resolveDownload(run: BackupRun): string {
  if (run.status !== 'OK' || !run.fileName) throw notFound('لا يوجد ملف لهذه النسخة');
  const file = filePathFor(run.fileName);
  if (!existsSync(file)) throw notFound('ملف النسخة غير موجود على القرص (ربما حُذف يدوياً)');
  return file;
}

/* ═══════════════════════ الحالة للواجهة ═══════════════════════ */

export interface BackupRunView {
  id: number;
  trigger: BackupTrigger;
  status: BackupRun['status'];
  startedAt: Date;
  finishedAt: Date | null;
  fileName: string | null;
  sizeBytes: number | null;
  error: string | null;
  fileExists: boolean;
}

function toView(run: BackupRun): BackupRunView {
  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    fileName: run.fileName,
    sizeBytes: run.sizeBytes === null ? null : Number(run.sizeBytes),
    error: run.error,
    fileExists: run.status === 'OK' && run.fileName ? existsSync(join(backupDir(), run.fileName)) : false,
  };
}

export type BackupHealth = 'ok' | 'warning' | 'none' | 'off';

/** أحدث نسخة ناجحة ما زال ملفها موجوداً — النسخة بلا ملف لا تحمي شيئاً */
async function latestUsableBackup(): Promise<BackupRun | null> {
  const recent = await prisma.backupRun.findMany({ where: { status: 'OK' }, orderBy: { startedAt: 'desc' }, take: 30 });
  return recent.find((r) => r.fileName && existsSync(join(backupDir(), r.fileName))) ?? null;
}

/** ملخص مختصر للوحة الرئيسية */
export async function getBackupSummary() {
  const [setting, lastOk, lastFailed] = await Promise.all([
    getBackupSetting(),
    latestUsableBackup(),
    prisma.backupRun.findFirst({ where: { status: 'FAILED' }, orderBy: { startedAt: 'desc' } }),
  ]);

  const lastOkAt = lastOk?.finishedAt ?? lastOk?.startedAt ?? null;
  const nextRunAt = computeNextRun(setting, lastOkAt, lastFailed?.startedAt ?? null);
  const schedulerActive = config.BACKUP_SCHEDULER === 'on';

  // تحذير: لا نسخة، أو آخر نسخة ناجحة أقدم من ضعف الفاصل (وحد أدنى 36 ساعة)
  const toleranceMs = Math.max(36, setting.intervalHours * 2) * 3_600_000;
  const stale = !lastOkAt || Date.now() - lastOkAt.getTime() > toleranceMs;
  const failedAfterOk = Boolean(lastFailed && (!lastOkAt || lastFailed.startedAt > lastOkAt));

  let health: BackupHealth = 'ok';
  if (!lastOkAt) health = 'none';
  else if (stale || failedAfterOk) health = 'warning';
  else if (!setting.enabled || !schedulerActive) health = 'off';

  return {
    health,
    enabled: setting.enabled,
    schedulerActive,
    running,
    intervalHours: setting.intervalHours,
    lastOkAt,
    lastOkSizeBytes: lastOk?.sizeBytes == null ? null : Number(lastOk.sizeBytes),
    lastFailedAt: failedAfterOk ? (lastFailed?.startedAt ?? null) : null,
    nextRunAt,
  };
}

export async function getBackupOverview() {
  const [setting, summary, runs, okRuns] = await Promise.all([
    getBackupSetting(),
    getBackupSummary(),
    prisma.backupRun.findMany({ orderBy: { startedAt: 'desc' }, take: 100 }),
    prisma.backupRun.findMany({ where: { status: 'OK' }, select: { sizeBytes: true, fileName: true } }),
  ]);

  // نعدّ فقط النسخ التي ما زال ملفها موجوداً على القرص
  const present = okRuns.filter((r) => r.fileName && existsSync(join(backupDir(), r.fileName)));
  const totalSizeBytes = present.reduce((sum, r) => sum + Number(r.sizeBytes ?? 0), 0);
  const dump = findMysqldump();

  return {
    settings: {
      enabled: setting.enabled,
      intervalHours: setting.intervalHours,
      timeOfDay: setting.timeOfDay,
      retentionCount: setting.retentionCount,
    },
    summary,
    storage: {
      dir: backupDir(),
      copyDir: copyDir(),
      mysqldump: dump.found,
      totalSizeBytes,
      count: present.length,
    },
    runs: runs.map(toView),
  };
}

/* ═══════════════════════ المجدول ═══════════════════════ */

let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  if (running) return;
  try {
    const setting = await getBackupSetting();
    if (!setting.enabled) return;

    const [lastOk, lastFailed] = await Promise.all([
      latestUsableBackup(),
      prisma.backupRun.findFirst({ where: { status: 'FAILED' }, orderBy: { startedAt: 'desc' } }),
    ]);
    const next = computeNextRun(
      setting,
      lastOk?.finishedAt ?? lastOk?.startedAt ?? null,
      lastFailed?.startedAt ?? null,
    );
    if (next && next.getTime() <= Date.now()) {
      console.log('[backup] تشغيل النسخة الاحتياطية المجدولة…');
      const result = await runBackup('SCHEDULED');
      console.log(
        result.status === 'OK'
          ? `[backup] تمت النسخة: ${result.fileName}`
          : `[backup] فشلت النسخة المجدولة: ${result.error ?? ''}`,
      );
    }
  } catch (err) {
    // تعارض مع نسخة قيد التنفيذ ليس خطأ؛ غيره نسجله ونكمل في الدورة التالية
    if (!(err instanceof AppError)) console.warn('[backup] خطأ في المجدول:', err);
  }
}

export async function startBackupScheduler(): Promise<void> {
  // نسخة علقت في RUNNING بسبب إيقاف الخادم أثناء التنفيذ لا تُعدّ ناجحة
  await prisma.backupRun
    .updateMany({
      where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
      data: { status: 'FAILED', finishedAt: new Date(), error: 'انقطعت النسخة بسبب إيقاف الخادم أثناء التنفيذ' },
    })
    .catch(() => undefined);

  if (config.BACKUP_SCHEDULER === 'off') {
    console.log('[backup] المجدول معطّل من البيئة (BACKUP_SCHEDULER=off)');
    return;
  }

  console.log(`[backup] المجدول يعمل — المجلد: ${backupDir()}`);
  setTimeout(() => void tick(), 15_000).unref?.();
  timer = setInterval(() => void tick(), 60_000);
  timer.unref?.();
}

export function stopBackupScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
