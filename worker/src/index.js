import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/authRoutes.js';
import { panelRoutes } from './routes/panelRoutes.js';
import { planDailyRoutes } from './routes/planDailyRoutes.js';
import { overviewReportRoutes } from './routes/overviewReportRoutes.js';
import { smbRoutes } from './routes/simulatorManpowerBackupRoutes.js';

const app = new Hono();

// Security headers on all responses
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// Strict CORS for API routes
app.use('/api/*', cors({
  origin: (origin, c) => {
    if (!origin) return '*';
    const host = c.req.header('host');
    if (origin === `https://${host}` || origin === `http://${host}`) return origin;
    if (c.env.CLIENT_ORIGIN && origin === c.env.CLIENT_ORIGIN) return origin;
    if (c.env.NODE_ENV !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
      return origin;
    }
    return null;
  },
  credentials: true
}));

// Health check
app.get('/health', async (c) => {
  let dbStatus = 'ok';
  try {
    await c.env.DB.prepare('SELECT 1 as ok').first();
  } catch (_) {
    dbStatus = 'error';
  }
  return c.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    database: dbStatus,
    system: 'BHEL Traction & DCS Panel Assembly Management Portal',
    runtime: 'Cloudflare Workers + D1',
    timestamp: new Date().toISOString()
  });
});

// Mount API routes
app.route('/api/auth', authRoutes);
app.route('/api/panels', panelRoutes);
app.route('/api', planDailyRoutes);
app.route('/api', overviewReportRoutes);
app.route('/api', smbRoutes);

// Fallback for non-API requests if ASSETS binding is reached
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json({ error: 'Not Found' }, 404);
});

app.onError((err, c) => {
  console.error('Unhandled worker error:', err.message);
  return c.json({ error: 'An unexpected internal server error occurred.' }, 500);
});

export default app;

