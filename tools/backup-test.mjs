/**
 * فحص نظام النسخ الاحتياطي على خادم حي.
 *
 * التشغيل: npm.cmd run test:backup
 * البيئة: API_BASE_URL (الافتراضي http://localhost:4000/api)
 *
 * يُنشئ نسخة واحدة حقيقية ويحذفها بعد الفحص، ويعيد إعدادات الجدولة كما كانت.
 * لا يمسّ أي نسخة موجودة مسبقاً.
 */

import { gunzipSync } from 'node:zlib';

const BASE = (process.env.API_BASE_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
const OWNER = { username: 'admin', password: 'Admin@2026' };
const SELLER = { username: 'seller', password: 'Seller@2026' };

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}\n      ${err instanceof Error ? err.message : err}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function login({ username, password }) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`تعذر تسجيل دخول ${username}: ${res.status}`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

async function call(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, data: json?.data };
}

const owner = await login(OWNER);
const seller = await login(SELLER);

const before = await call(owner, 'GET', '/backups');
assert(before.status === 200, `GET /backups أعاد ${before.status} — هل الخادم يعمل بنسخة تحوي النسخ الاحتياطي؟`);
const originalSettings = before.data.settings;
const existingIds = new Set(before.data.runs.map((r) => r.id));
let createdId = null;

try {
  console.log('\nالصلاحيات');
  await check('بدون دخول → 401', async () => {
    const r = await call(null, 'GET', '/backups');
    assert(r.status === 401, `status=${r.status}`);
  });
  await check('البائع → 403 على كل المسارات', async () => {
    const routes = [
      ['GET', '/backups'],
      ['POST', '/backups/run'],
      ['PATCH', '/backups/settings'],
      ['GET', '/backups/1/download'],
      ['DELETE', '/backups/1'],
    ];
    for (const [m, p] of routes) {
      const r = await call(seller, m, p, m === 'GET' || m === 'DELETE' ? undefined : {});
      assert(r.status === 403, `${m} ${p} → ${r.status}`);
    }
  });

  console.log('\nالإعدادات');
  await check('شكل الاستجابة', async () => {
    const d = before.data;
    assert(typeof d.settings.enabled === 'boolean', 'enabled');
    assert([6, 12, 24, 48, 168].includes(d.settings.intervalHours), 'intervalHours');
    assert(/^\d\d:\d\d$/.test(d.settings.timeOfDay), 'timeOfDay');
    assert(Array.isArray(d.runs), 'runs');
    assert(typeof d.storage.dir === 'string' && d.storage.mysqldump === true, 'storage');
    assert(['ok', 'warning', 'none', 'off'].includes(d.summary.health), 'health');
  });
  await check('رفض فاصل غير مدعوم', async () => {
    const r = await call(owner, 'PATCH', '/backups/settings', { intervalHours: 5 });
    assert(r.status === 422, `status=${r.status}`);
  });
  await check('رفض وقت غير صالح', async () => {
    const r = await call(owner, 'PATCH', '/backups/settings', { timeOfDay: '25:00' });
    assert(r.status === 422, `status=${r.status}`);
  });
  await check('رفض عدد احتفاظ خارج 3..90', async () => {
    for (const retentionCount of [1, 2, 91, 1000]) {
      const r = await call(owner, 'PATCH', '/backups/settings', { retentionCount });
      assert(r.status === 422, `retention=${retentionCount} → ${r.status}`);
    }
  });
  await check('حفظ إعدادات صحيحة وانعكاسها', async () => {
    const r = await call(owner, 'PATCH', '/backups/settings', { intervalHours: 12, timeOfDay: '03:30', retentionCount: 20 });
    assert(r.status === 200, `status=${r.status}`);
    const s = r.data.settings;
    assert(s.intervalHours === 12 && s.timeOfDay === '03:30' && s.retentionCount === 20, 'القيم لم تُحفظ');
  });
  await check('تعطيل الجدولة → النسخة التالية null', async () => {
    const r = await call(owner, 'PATCH', '/backups/settings', { enabled: false });
    assert(r.status === 200 && r.data.summary.nextRunAt === null, `nextRunAt=${r.data?.summary?.nextRunAt}`);
  });
  await check('تفعيل الجدولة → موعد تالٍ محسوب', async () => {
    const r = await call(owner, 'PATCH', '/backups/settings', { enabled: true });
    assert(r.status === 200 && typeof r.data.summary.nextRunAt === 'string', `nextRunAt=${r.data?.summary?.nextRunAt}`);
  });

  console.log('\nالنسخ اليدوي');
  await check('POST /backups/run ينشئ نسخة ناجحة', async () => {
    const r = await call(owner, 'POST', '/backups/run', {});
    assert(r.status === 201, `status=${r.status} ${r.json?.error?.message ?? ''}`);
    const row = r.data.runs.find((x) => !existingIds.has(x.id));
    assert(row, 'لم يظهر سجل جديد');
    createdId = row.id;
    assert(row.status === 'OK' && row.trigger === 'MANUAL', `status=${row.status} trigger=${row.trigger}`);
    assert(/^gold_pos-\d{8}-\d{6}\.sql\.gz$/.test(row.fileName), `fileName=${row.fileName}`);
    assert(row.fileExists === true && row.sizeBytes > 500, `size=${row.sizeBytes}`);
    const last = r.data.summary.lastOkAt;
    assert(last && Date.now() - new Date(last).getTime() < 120_000, 'lastOkAt غير حديث');
  });
  await check('الملف المنزَّل gzip صالح ويحوي جداول النظام', async () => {
    const res = await fetch(`${BASE}/backups/${createdId}/download`, { headers: { cookie: owner } });
    assert(res.status === 200, `status=${res.status}`);
    assert((res.headers.get('content-disposition') ?? '').includes('.sql.gz'), 'Content-Disposition');
    const buf = Buffer.from(await res.arrayBuffer());
    assert(buf[0] === 0x1f && buf[1] === 0x8b, 'ليس gzip');
    const sql = gunzipSync(buf).toString('utf8').toLowerCase();
    for (const table of ['Item', 'Sale', 'User', 'BackupRun']) {
      // MySQL على ويندوز يحوّل أسماء الجداول إلى أحرف صغيرة (lower_case_table_names=1)
      assert(sql.includes(`create table \`${table.toLowerCase()}\``), `جدول ${table} غير موجود في النسخة`);
    }
    assert(sql.includes('dump completed'), 'النسخة ناقصة');
  });
  await check('نسختان متزامنتان: لا تتداخلان', async () => {
    const results = await Promise.all([call(owner, 'POST', '/backups/run', {}), call(owner, 'POST', '/backups/run', {})]);
    const okCount = results.filter((r) => r.status === 201).length;
    const conflicts = results.filter((r) => r.status === 409).length;
    assert(okCount >= 1 && okCount + conflicts === 2, `statuses=${results.map((r) => r.status).join(',')}`);
    // نحذف أي نسخة إضافية أنشأها هذا الفحص
    const list = await call(owner, 'GET', '/backups');
    for (const row of list.data.runs) {
      if (!existingIds.has(row.id) && row.id !== createdId) await call(owner, 'DELETE', `/backups/${row.id}`);
    }
  });

  console.log('\nالرئيسية');
  await check('المالك يرى ملخص النسخ، والبائع لا', async () => {
    const o = await call(owner, 'GET', '/dashboard');
    const s = await call(seller, 'GET', '/dashboard');
    assert(o.data.backup && o.data.backup.lastOkAt, `owner backup=${JSON.stringify(o.data?.backup)}`);
    assert(s.data.backup === null, 'البائع يرى ملخص النسخ');
  });

  console.log('\nالحذف');
  await check('DELETE يحذف السجل والملف', async () => {
    const r = await call(owner, 'DELETE', `/backups/${createdId}`);
    assert(r.status === 200, `status=${r.status}`);
    assert(!r.data.runs.some((x) => x.id === createdId), 'السجل ما زال موجوداً');
    const d = await fetch(`${BASE}/backups/${createdId}/download`, { headers: { cookie: owner } });
    assert(d.status === 404, `download after delete → ${d.status}`);
    createdId = null;
  });
  await check('حذف سجل غير موجود → 404', async () => {
    const r = await call(owner, 'DELETE', '/backups/99999999');
    assert(r.status === 404, `status=${r.status}`);
  });
  await check('معرّف غير صالح → 400', async () => {
    const r = await call(owner, 'GET', '/backups/abc/download');
    assert(r.status === 400, `status=${r.status}`);
  });
} finally {
  if (createdId !== null) await call(owner, 'DELETE', `/backups/${createdId}`);
  await call(owner, 'PATCH', '/backups/settings', originalSettings);
  console.log('\n(أُعيدت إعدادات الجدولة كما كانت)');
}

console.log(`\n=== فحص النسخ الاحتياطي: passed=${passed} failed=${failed} → ${failed === 0 ? 'PASS' : 'FAIL'} ===`);
process.exit(failed === 0 ? 0 : 1);
