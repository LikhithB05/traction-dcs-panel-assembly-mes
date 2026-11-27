import { verifyJwt } from '../utils/crypto.js';

const DEV_FALLBACK_SECRET = 'bhel_dev_only_local_jwt_secret_not_for_production';

// Lightweight per-isolate sliding-window rate limiter for login attempts
const loginAttempts = new Map();

export function getJwtSecret(env) {
  const secret = env.JWT_SECRET;
  if (!secret) {
    if (env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET secret must be configured in production.');
    }
    return DEV_FALLBACK_SECRET;
  }
  return secret;
}

export function checkLoginRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxAttempts = 20;
  const key = ip || 'unknown';
  const entries = (loginAttempts.get(key) || []).filter((t) => now - t < windowMs);
  if (entries.length >= maxAttempts) {
    return false;
  }
  entries.push(now);
  loginAttempts.set(key, entries);
  return true;
}

export async function authenticateToken(c, next) {
  const authHeader = c.req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return c.json({ error: 'Authentication required. No session token provided.' }, 401);
  }

  try {
    const secret = getJwtSecret(c.env);
    const user = await verifyJwt(token, secret);
    if (!user) {
      return c.json({ error: 'Session expired or invalid token. Please sign in again.' }, 401);
    }
    c.set('user', user);
    await next();
  } catch (err) {
    return c.json({ error: 'Authentication configuration error.' }, 500);
  }
}

export async function requireAdmin(c, next) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  if (user.isAdmin || user.role === 'AKR' || user.role === 'CKG') {
    await next();
    return;
  }
  return c.json({ error: 'Administrator access required (AKR or CKG role).' }, 403);
}

