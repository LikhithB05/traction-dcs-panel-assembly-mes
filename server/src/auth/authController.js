import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';

import { JWT_SECRET } from '../config/env.js';

export async function login(req, res) {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a valid JSON object.' });
    }

    const { username, pin } = req.body;

    if (!username || !pin || typeof username !== 'string' || typeof pin !== 'string') {
      return res.status(400).json({ error: 'Username/account ID and PIN are required as non-empty strings.' });
    }

    const normalizedUser = username.trim().toLowerCase();
    if (!normalizedUser) {
      return res.status(400).json({ error: 'Username cannot be blank.' });
    }

    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(normalizedUser);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials. User account not found.' });
    }

    const isMatch = await bcrypt.compare(pin, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid PIN or credentials.' });
    }

    // Sign session JWT with unified secret
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      isAdmin: Boolean(user.is_admin),
      displayName: user.display_name
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

    // Record audit log
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'log_' + crypto.randomUUID(),
      new Date().toISOString(),
      user.id,
      user.username,
      'USER_LOGIN',
      'USER',
      user.id,
      `User signed in with role ${user.role}`
    );

    return res.json({
      token,
      user: payload
    });
  } catch (error) {
    // Safe server-side diagnostic: never log PIN, hash, or secret
    console.error(`[AUTH_LOGIN_ERROR] ${error.name}: ${error.message}\n${error.stack || ''}`);
    return res.status(500).json({ error: 'Server authentication failure. Please contact administrator.' });
  }
}

export function getCurrentUser(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  return res.json({ user: req.user });
}

export function logout(req, res) {
  try {
    if (req.user) {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'log_' + crypto.randomUUID(),
        new Date().toISOString(),
        req.user.id,
        req.user.username,
        'USER_LOGOUT',
        'USER',
        req.user.id,
        `User signed out`
      );
    }
    return res.json({ message: 'Successfully signed out.' });
  } catch (error) {
    return res.status(500).json({ error: 'Error during logout.' });
  }
}
