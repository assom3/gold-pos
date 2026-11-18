/**
 * استعادة قاعدة البيانات من ملف نسخة احتياطية (.sql أو .sql.gz).
 *
 * الاستعمال (من جذر المشروع):
 *   npm.cmd run db:restore -- backups\gold_pos-YYYYMMDD-HHMMSS.sql.gz --yes
 *
 * ⚠ يستبدل كل بيانات القاعدة الحالية بمحتوى النسخة.
 * قبل الاستعادة يُنشئ نسخة أمان تلقائية في backups/pre-restore-*.sql.gz.
 * أوقف الخادم قبل التشغيل، وأبقِ MySQL شغّالاً.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const fileArg = args.find((a) => !a.startsWith('--'));

if (!fileArg) fail('حدّد ملف النسخة: npm.cmd run db:restore -- backups\gold_pos-XXXX.sql.gz --yes');
const file = resolve(process.cwd(), fileArg);
if (!existsSync(file)) fail(`الملف غير موجود: ${file}`);

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const f of [resolve(root, 'apps/api/.env'), resolve(root, '.env')]) {
    if (!existsSync(f)) continue;
    const match = readFileSync(f, 'utf8').match(/^DATABASE_URL\s*=\s*(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  fail('لم أجد DATABASE_URL في apps/api/.env');
}

const url = new URL(readDatabaseUrl());
const db = {
  host: url.hostname || '127.0.0.1',
  port: url.port || '3306',
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, '').split('?')[0]),
};

function findBin(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const mysqlRoot = resolve(root, 'tools/mysql');
  if (existsSync(mysqlRoot)) {
    for (const entry of readdirSync(mysqlRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('mysql-')) continue;
      const candidate = join(mysqlRoot, entry.name, 'bin', exe);
      if (existsSync(candidate)) return candidate;
    }
  }
  return name;
}

const defaultsFile = resolve(root, 'tools/mysql/my.ini');
const common = [
  ...(existsSync(defaultsFile) ? [`--defaults-file=${defaultsFile}`] : []),
  `--user=${db.user}`,
  `--host=${db.host}`,
  `--port=${db.port}`,
  '--protocol=TCP',
];
const env = { ...process.env, MYSQL_PWD: db.password };

console.log(`الملف: ${file}`);
console.log(`القاعدة: ${db.database} على ${db.host}:${db.port}`);
if (!confirmed) {
  console.log('\n⚠ الاستعادة تستبدل كل بيانات القاعدة الحالية بمحتوى النسخة.');
  console.log('أضف --yes للتأكيد، وتأكد أن الخادم متوقف.');
  process.exit(2);
}

// 1) نسخة أمان قبل أي تغيير
const two = (n) => String(n).padStart(2, '0');
const d = new Date();
const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
mkdirSync(resolve(root, 'backups'), { recursive: true });
const safetyFile = resolve(root, `backups/pre-restore-${stamp}.sql.gz`);

console.log('… إنشاء نسخة أمان قبل الاستعادة');
const dump = spawn(
  findBin('mysqldump'),
  [...common, '--single-transaction', '--no-tablespaces', '--routines', '--triggers', '--default-character-set=utf8mb4', db.database],
  { env, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] },
);
const dumpExit = new Promise((res, rej) => {
  dump.once('error', rej);
  dump.once('close', res);
});
await Promise.all([pipeline(dump.stdout, createGzip(), createWriteStream(safetyFile)), dumpExit]).catch((e) =>
  fail(`تعذر إنشاء نسخة الأمان، لم يتغير شيء: ${e.message}`),
);
if ((await dumpExit) !== 0) fail('فشلت نسخة الأمان، لم يتغير شيء.');
console.log(`✓ نسخة الأمان: ${safetyFile}`);

// 2) الاستعادة
console.log('… استعادة النسخة');
const client = spawn(findBin('mysql'), [...common, '--default-character-set=utf8mb4', db.database], {
  env,
  windowsHide: true,
  stdio: ['pipe', 'inherit', 'inherit'],
});
const clientExit = new Promise((res, rej) => {
  client.once('error', rej);
  client.once('close', res);
});
const source = file.endsWith('.gz') ? [createReadStream(file), createGunzip(), client.stdin] : [createReadStream(file), client.stdin];
try {
  await Promise.all([pipeline(...source), clientExit.then((code) => {
    if (code !== 0) throw new Error(`mysql انتهى برمز ${code}`);
  })]);
} catch (e) {
  fail(`فشلت الاستعادة: ${e.message}\nلاسترجاع الحالة السابقة: npm.cmd run db:restore -- "${safetyFile}" --yes`);
}

console.log('✓ تمت الاستعادة بنجاح. شغّل الخادم الآن.');
