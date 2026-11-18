import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  for (const file of [resolve(root, 'apps/api/.env'), resolve(root, '.env')]) {
    if (!existsSync(file)) continue;
    const match = readFileSync(file, 'utf8').match(/^DATABASE_URL\s*=\s*(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }

  throw new Error('لم أجد DATABASE_URL في apps/api/.env أو في متغيرات البيئة.');
}

function parseDatabaseUrl(url) {
  const withoutScheme = url.replace(/^mysql:\/\//, '');
  const at = withoutScheme.lastIndexOf('@');
  if (at === -1) throw new Error('صيغة DATABASE_URL غير صحيحة.');

  const credentials = withoutScheme.slice(0, at);
  const hostPart = withoutScheme.slice(at + 1);
  const colon = credentials.indexOf(':');
  if (colon === -1) throw new Error('DATABASE_URL لا يحتوي على كلمة مرور.');

  const slash = hostPart.indexOf('/');
  if (slash === -1) throw new Error('DATABASE_URL لا يحتوي على اسم قاعدة البيانات.');

  const hostPort = hostPart.slice(0, slash);
  const [host, port = '3306'] = hostPort.split(':');
  const database = hostPart.slice(slash + 1).split('?')[0];

  return {
    user: decodeURIComponent(credentials.slice(0, colon)),
    password: decodeURIComponent(credentials.slice(colon + 1)),
    host,
    port,
    database,
  };
}

function findMysqldump() {
  const configured = process.env.MYSQLDUMP_PATH;
  if (configured) return configured;

  const portable = resolve(root, 'tools/mysql/mysql-8.4.0-winx64/bin/mysqldump.exe');
  if (existsSync(portable)) return portable;

  return 'mysqldump';
}

function stamp() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

const db = parseDatabaseUrl(readDatabaseUrl());
const mysqldump = findMysqldump();
const defaultsFile = resolve(root, 'tools/mysql/my.ini');
if (!existsSync(defaultsFile)) {
  throw new Error(`لم أجد ملف الإعدادات: ${defaultsFile}`);
}

const backupDir = resolve(root, 'backups');
mkdirSync(backupDir, { recursive: true });
const outputFile = resolve(backupDir, `gold_pos-${stamp()}.sql`);

const args = [
  `--defaults-file=${defaultsFile}`,
  `--user=${db.user}`,
  `--host=${db.host}`,
  `--port=${db.port}`,
  '--protocol=TCP',
  '--single-transaction',
  '--no-tablespaces',
  '--routines',
  '--triggers',
  '--default-character-set=utf8mb4',
  `--result-file=${outputFile}`,
  db.database,
];

const result = spawnSync(mysqldump, args, {
  env: { ...process.env, MYSQL_PWD: db.password },
  encoding: 'utf8',
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || `فشل mysqldump برمز ${result.status}\n`);
  process.exit(result.status ?? 1);
}

const sizeKb = Math.max(1, Math.round(statSync(outputFile).size / 1024));
console.log(`✓ تم إنشاء النسخة الاحتياطية: ${outputFile} (${sizeKb} كيلوبايت)`);
