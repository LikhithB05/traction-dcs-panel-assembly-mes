import { Hono } from 'hono';
import { verifyPin, signJwt } from '../utils/crypto.js';
import { authenticateToken, getJwtSecret, checkLoginRateLimit } from '../middleware/auth.js';

export const authRoutes = new Hono();

authRoutes.post('/login', async (c) => {
  try {
    const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'local';
    if (!checkLoginRateLimit(clientIp)) {
      return c.json({ error: 'Too many login attempts. Please wait a minute and try again.' }, 429);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Request body must be a valid JSON object.' }, 400);
    }

    const { username, pin } = body;
    if (!username || !pin || typeof username !== 'string' || typeof pin !== 'string') {
      return c.json({ error: 'Username/account ID and PIN are required as non-empty strings.' }, 400);
    }

    const normalizedUser = username.trim().toLowerCase();
    if (!normalizedUser) {
      return c.json({ error: 'Username cannot be blank.' }, 400);
    }

    const user = await c.env.DB.prepare('SELECT * FROM users WHERE LOWER(username) = ?').bind(normalizedUser).first();
    if (!user) {
      return c.json({ error: 'Invalid credentials. User account not found.' }, 401);
    }

    const isMatch = await verifyPin(pin, user.password_hash);
    if (!isMatch) {
      return c.json({ error: 'Invalid PIN or credentials.' }, 401);
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      isAdmin: Boolean(user.is_admin),
      displayName: user.display_name
    };

    const token = await signJwt(payload, getJwtSecret(c.env), 12 * 3600);

    await c.env.DB.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'log_' + crypto.randomUUID(),
      new Date().toISOString(),
      user.id,
      user.username,
      'USER_LOGIN',
      'USER',
      user.id,
      `User signed in with role ${user.role}`
    ).run();

    return c.json({ token, user: payload });
  } catch (err) {
    console.error('Auth login error:', err.message);
    return c.json({ error: 'Server authentication failure. Please contact administrator.' }, 500);
  }
});

authRoutes.get('/me', authenticateToken, (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthenticated' }, 401);
  return c.json({ user });
});

authRoutes.post('/logout', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    if (user) {
      await c.env.DB.prepare(`
        INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        'log_' + crypto.randomUUID(),
        new Date().toISOString(),
        user.id,
        user.username,
        'USER_LOGOUT',
        'USER',
        user.id,
        'User signed out'
      ).run();
    }
    return c.json({ message: 'Successfully signed out.' });
  } catch (_) {
    return c.json({ message: 'Signed out.' });
  }
});

