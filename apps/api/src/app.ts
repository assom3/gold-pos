import './lib/zod-ar.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { attachUser, requireAuth, requireRole } from './auth/middleware.js';
import { errorHandler, notFoundHandler, originGuard } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { lookupsRouter } from './routes/lookups.js';
import { settingsRouter } from './routes/settings.js';
import { pricesRouter } from './routes/prices.js';
import { itemsRouter } from './routes/items.js';
import { salesRouter } from './routes/sales.js';
import { inventoryRouter } from './routes/inventory.js';
import { stocktakesRouter } from './routes/stocktakes.js';
import { reportsRouter } from './routes/reports.js';
import { dashboardRouter } from './routes/dashboard.js';
import { ah, ok } from './lib/http.js';
import { prisma } from './db.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // لا نثق بأي ترويسة وكيل بشكل افتراضي، حتى لا يستطيع العميل تزوير IP
  // وتجاوز حدود المحاولات. اضبط TRUST_PROXY عند التشغيل خلف Nginx/Caddy.
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  const allowedOrigins = config.isProd
    ? [config.APP_ORIGIN]
    : [config.APP_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'];
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(originGuard);
  app.use(attachUser);

  // بيانات الفواتير والعملاء لا تُخزَّن في أي كاش وسيط أو متصفح
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.get('/api/health', (_req, res) => ok(res, { ok: true, time: new Date().toISOString() }));

  /** فحص جاهزية النظام للواجهة (هل القاعدة متصلة؟ هل الأسعار مضبوطة؟) */
  app.get(
    '/api/bootstrap',
    ah(async (req, res) => {
      const [setting, users] = await Promise.all([
        prisma.setting.findUnique({ where: { id: 1 } }),
        prisma.user.count(),
      ]);

      // بيانات المحل تُعاد فقط لمستخدم مسجّل — لا نكشف هوية المحل للزوار
      const authed = Boolean(req.user);
      return ok(res, {
        initialized: Boolean(setting) && users > 0,
        version: '0.2.1',
        ...(authed
          ? { shopName: setting?.shopName ?? null, currency: setting?.currency ?? 'LYD' }
          : {}),
      });
    }),
  );

  app.use('/api/auth', authRouter);
  app.use('/api/users', requireAuth, requireRole('OWNER'), usersRouter);
  app.use('/api/lookups', requireAuth, lookupsRouter);
  app.use('/api/settings', requireAuth, settingsRouter);
  app.use('/api/prices', requireAuth, pricesRouter);
  app.use('/api/items', requireAuth, itemsRouter);
  app.use('/api/sales', requireAuth, salesRouter);
  app.use('/api/inventory', requireAuth, inventoryRouter);
  app.use('/api/stocktakes', requireAuth, stocktakesRouter);
  app.use('/api/reports', requireAuth, requireRole('OWNER'), reportsRouter);
  app.use('/api/dashboard', requireAuth, dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
