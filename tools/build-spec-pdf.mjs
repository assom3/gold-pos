/**
 * توليد docs/SYSTEM_SPECIFICATION.pdf من docs/SYSTEM_SPECIFICATION.md.
 *
 * يضبط متغيرات أداة PDF العامة ثم يستدعي tools/build-user-guide.mjs،
 * حتى تبقى أدوات التحويل والخطوط والطباعة في مكان واحد.
 *
 * التشغيل: npm.cmd run docs:pdf:spec
 */

process.env.DOCS_MD = 'SYSTEM_SPECIFICATION.md';
process.env.DOCS_PDF = 'SYSTEM_SPECIFICATION.pdf';
process.env.DOCS_TITLE = 'المواصفات الكاملة لنظام ذهب';

await import('./build-user-guide.mjs');
