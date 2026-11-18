/**
 * توليد docs/USER_MANUAL.pdf من docs/USER_MANUAL.md.
 *
 * يحوّل الماركداون إلى HTML عربي RTL بخط IBM Plex Sans Arabic (مضمّن داخل الملف)،
 * ثم يطبع الصفحات إلى PDF عبر Microsoft Edge headless.
 *
 * التشغيل: npm.cmd run docs:pdf
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mdName = process.env.DOCS_MD ?? 'USER_MANUAL.md';
const pdfName = process.env.DOCS_PDF ?? mdName.replace(/\.md$/i, '.pdf');
const mdPath = join(root, 'docs', mdName);
const pdfPath = join(root, 'docs', pdfName);
const htmlPath = join(root, 'docs', `.${basename(mdName, '.md')}.tmp.html`);
const pageTitle = process.env.DOCS_TITLE ?? 'دليل استعمال نظام ذهب';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const md = readFileSync(mdPath, 'utf8');

// ——— تحويل مبسّط للماركداون ———————————————————————————————

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text) {
  let value = escapeHtml(text);
  const codes = [];
  value = value.replace(/`([^`]+)`/g, (_m, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  value = value.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)]}</code>`);
  return value;
}

function isTableSeparator(line) {
  return /^\|[\s:|-]+\|$/.test(line.trim());
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function headingId(text) {
  return text
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

const lines = md.replace(/\r\n/g, '\n').split('\n');
const out = [];
let index = 0;

function flushParagraph(buffer) {
  if (buffer.length === 0) return;
  out.push(`<p>${inline(buffer.join(' '))}</p>`);
  buffer.length = 0;
}

const paragraph = [];

while (index < lines.length) {
  const line = lines[index];

  // كتلة كود
  if (line.trim().startsWith('```')) {
    flushParagraph(paragraph);
    const language = line.trim().slice(3).trim();
    const code = [];
    index += 1;
    while (index < lines.length && !lines[index].trim().startsWith('```')) {
      code.push(lines[index]);
      index += 1;
    }
    index += 1;
    out.push(
      `<pre${language ? ` data-lang="${escapeHtml(language)}"` : ''}><code>${escapeHtml(code.join('\n'))}</code></pre>`,
    );
    continue;
  }

  // عنوان
  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading) {
    flushParagraph(paragraph);
    const level = heading[1].length;
    const text = heading[2].trim();
    out.push(`<h${level} id="${headingId(text)}">${inline(text)}</h${level}>`);
    index += 1;
    continue;
  }

  // فاصل
  if (/^-{3,}\s*$/.test(line.trim())) {
    flushParagraph(paragraph);
    out.push('<hr />');
    index += 1;
    continue;
  }

  // جدول
  if (line.trim().startsWith('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
    flushParagraph(paragraph);
    const header = splitRow(line);
    index += 2;
    const rows = [];
    while (index < lines.length && lines[index].trim().startsWith('|')) {
      rows.push(splitRow(lines[index]));
      index += 1;
    }
    out.push('<table>');
    out.push('<thead><tr>' + header.map((cell) => `<th>${inline(cell)}</th>`).join('') + '</tr></thead>');
    out.push('<tbody>');
    for (const row of rows) {
      out.push('<tr>' + row.map((cell) => `<td>${inline(cell)}</td>`).join('') + '</tr>');
    }
    out.push('</tbody></table>');
    continue;
  }

  // اقتباس
  if (/^>\s?/.test(line)) {
    flushParagraph(paragraph);
    const quote = [];
    while (index < lines.length && /^>\s?/.test(lines[index])) {
      quote.push(lines[index].replace(/^>\s?/, ''));
      index += 1;
    }
    out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
    continue;
  }

  // قائمة نقطية
  if (/^\s*[-*]\s+/.test(line)) {
    flushParagraph(paragraph);
    const items = [];
    while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
      items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
      index += 1;
    }
    out.push('<ul>' + items.map((item) => `<li>${inline(item)}</li>`).join('') + '</ul>');
    continue;
  }

  // قائمة مرقمة
  if (/^\s*\d+\.\s+/.test(line)) {
    flushParagraph(paragraph);
    const items = [];
    while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
      items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
      index += 1;
    }
    out.push('<ol>' + items.map((item) => `<li>${inline(item)}</li>`).join('') + '</ol>');
    continue;
  }

  // سطر فارغ
  if (line.trim() === '') {
    flushParagraph(paragraph);
    index += 1;
    continue;
  }

  paragraph.push(line.trim());
  index += 1;
}

flushParagraph(paragraph);

// ——— الخطوط المضمّنة ———————————————————————————————————————

function fontData(weight, subset) {
  const file = join(
    root,
    'node_modules',
    '@fontsource',
    'ibm-plex-sans-arabic',
    'files',
    `ibm-plex-sans-arabic-${subset}-${weight}-normal.woff2`,
  );
  try {
    return readFileSync(file).toString('base64');
  } catch {
    return null;
  }
}

function fontFace(weight, subset, range) {
  const data = fontData(weight, subset);
  if (!data) return '';
  return `@font-face{font-family:"IBM Plex Sans Arabic";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2");unicode-range:${range};}`;
}

const arabicRange = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FEFF';
const latinRange = 'U+0000-05FF,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2C60-2C7F,U+A720-A7FF';

const embeddedFonts = [400, 600, 700]
  .map((weight) => fontFace(weight, 'arabic', arabicRange) + fontFace(weight, 'latin', latinRange))
  .join('\n');

const css = `
${embeddedFonts}
@page{size:A4;margin:18mm 16mm 20mm;}
*{box-sizing:border-box;}
body{font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;font-size:11.3pt;line-height:1.95;color:#1e1e1e;margin:0;background:#fff;}
h1{font-size:27pt;line-height:1.5;text-align:center;margin:48mm 0 10mm;color:#8a6d1a;page-break-after:always;}
h2{font-size:18pt;color:#8a6d1a;border-bottom:2px solid #e6d9a8;padding-bottom:5px;margin:0 0 14px;page-break-before:always;}
h3{font-size:13.5pt;color:#3d3d3d;margin:18px 0 6px;page-break-after:avoid;}
h4{font-size:12pt;color:#555;margin:14px 0 4px;page-break-after:avoid;}
p{margin:7px 0;text-align:justify;}
ul,ol{margin:6px 0;padding-right:22px;}
li{margin:3px 0;}
table{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:9.8pt;page-break-inside:auto;}
thead{display:table-header-group;}
tr{page-break-inside:avoid;}
th,td{border:1px solid #d6d6d6;padding:5px 7px;text-align:right;vertical-align:top;}
th{background:#f5efdc;color:#5c4a12;font-weight:600;}
tbody tr:nth-child(even){background:#fbfaf6;}
code{font-family:Consolas,"Courier New",monospace;font-size:9.3pt;background:#f2f2f2;border:1px solid #e5e5e5;border-radius:4px;padding:0 3px;direction:ltr;unicode-bidi:embed;}
pre{background:#f7f7f7;border:1px solid #e3e3e3;border-radius:7px;padding:9px 11px;direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-word;page-break-inside:avoid;}
pre code{background:none;border:none;padding:0;}
blockquote{margin:10px 0;padding:7px 12px;background:#fbf7e8;border-right:4px solid #c9a227;color:#4a3d12;page-break-inside:avoid;}
a{color:#8a6d1a;text-decoration:none;}
hr{border:none;border-top:1px solid #ddd;margin:14px 0;}
strong{font-weight:700;}
`;

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(pageTitle)}</title>
<style>${css}</style>
</head>
<body>
${out.join('\n')}
</body>
</html>`;

writeFileSync(htmlPath, html, 'utf8');

// ——— الطباعة عبر Edge ————————————————————————————————————

const profile = join(tmpdir(), `gold-pdf-${process.pid}`);
mkdirSync(profile, { recursive: true });

const result = spawnSync(
  edgePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-pdf-header-footer',
    `--user-data-dir=${profile}`,
    '--virtual-time-budget=5000',
    '--run-all-compositor-stages-before-draw',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ],
  { encoding: 'utf8', timeout: 120_000 },
);

rmSync(profile, { recursive: true, force: true });
if (process.env.KEEP_HTML === '1') {
  console.log(`  HTML محفوظ للمعاينة: ${htmlPath}`);
} else {
  rmSync(htmlPath, { force: true });
}

if (result.error) {
  console.error('تعذر تشغيل Edge:', result.error.message);
  process.exit(1);
}

const stats = readFileSync(pdfPath);
if (stats.length < 10_000) {
  console.error('ملف PDF صغير جداً أو فشل توليده. تحقق من Edge.');
  process.exit(1);
}

console.log(`✓ تم توليد docs/${pdfName} (${(stats.length / 1024).toFixed(0)} كيلوبايت)`);
