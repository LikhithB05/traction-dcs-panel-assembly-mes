import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';

export class CustomManpowerController {
  static getCustomManpower(req, res) {
    try {
      const db = getDatabase();
      const { area, type, includeInactive } = req.query;

      let query = 'SELECT * FROM custom_manpower WHERE 1=1';
      const params = [];

      if (!includeInactive || includeInactive === 'false') {
        query += ' AND is_active = 1';
      }
      if (area) {
        query += ' AND area = ?';
        params.push(area);
      }
      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }

      query += ' ORDER BY type ASC, name ASC';

      const list = db.prepare(query).all(...params);
      return res.json(list);
    } catch (error) {
      console.error('Error fetching custom manpower:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch custom manpower.' });
    }
  }

  static createCustomManpower(req, res) {
    try {
      const db = getDatabase();
      const { area, type, name, members } = req.body;

      if (!area || !['KSM', 'PDR', 'CRM'].includes(area)) {
        return res.status(400).json({ error: 'Valid area (KSM, PDR, or CRM) is required.' });
      }

      if (!type || !['worker', 'team'].includes(type)) {
        return res.status(400).json({ error: "Type must be either 'worker' or 'team'." });
      }

      if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) {
        return res.status(400).json({ error: 'Name is required and must be between 2 and 60 characters.' });
      }

      const cleanName = name.trim();
      let cleanMembers = null;

      if (type === 'team') {
        if (!members || typeof members !== 'string' || members.trim().length === 0) {
          return res.status(400).json({ error: 'Team members are required for a custom team assignment.' });
        }
        cleanMembers = members.trim();
      }

      // Authorization check: Area lead for their area, or Master Admin (AKR/CKG)
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      const isMasterAdmin = user.isAdmin || user.role === 'AKR' || user.role === 'CKG';
      if (!isMasterAdmin && user.role !== area) {
        return res.status(403).json({
          error: `Permission denied. User with role '${user.role}' cannot add custom manpower for area '${area}'.`
        });
      }

      const now = new Date().toISOString();

      // Check existing
      const existing = db.prepare('SELECT * FROM custom_manpower WHERE area = ? AND type = ? AND name = ?').get(area, type, cleanName);

      if (existing) {
        if (existing.is_active === 1) {
          // If already exists and active, return existing cleanly (idempotent duplicate handling)
          return res.status(200).json({
            message: `Custom ${type} '${cleanName}' is already registered for ${area}.`,
            data: existing
          });
        } else {
          // Reactivate
          db.prepare(`
            UPDATE custom_manpower
            SET is_active = 1, members = COALESCE(?, members), updated_at = ?
            WHERE id = ?
          `).run(cleanMembers, now, existing.id);

          const updated = db.prepare('SELECT * FROM custom_manpower WHERE id = ?').get(existing.id);

          db.prepare(`
            INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            'log_' + crypto.randomUUID(),
            now,
            user.id,
            user.username,
            'REACTIVATE_CUSTOM_MANPOWER',
            'CUSTOM_MANPOWER',
            existing.id,
            `Reactivated custom ${type} '${cleanName}' in area ${area}`
          );

          return res.status(200).json({
            message: `Custom ${type} '${cleanName}' reactivated successfully for ${area}.`,
            data: updated
          });
        }
      }

      const id = 'cm_' + crypto.randomUUID();

      db.prepare(`
        INSERT INTO custom_manpower (id, area, type, name, members, is_active, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(id, area, type, cleanName, cleanMembers, user.username, now, now);

      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'log_' + crypto.randomUUID(),
        now,
        user.id,
        user.username,
        'CREATE_CUSTOM_MANPOWER',
        'CUSTOM_MANPOWER',
        id,
        `Created custom ${type} '${cleanName}' (${cleanMembers ? `Members: ${cleanMembers}` : 'Worker'}) for ${area}`
      );

      const created = db.prepare('SELECT * FROM custom_manpower WHERE id = ?').get(id);
      return res.status(201).json({
        message: `Custom ${type} '${cleanName}' registered successfully for ${area}.`,
        data: created
      });
    } catch (error) {
      console.error('Error creating custom manpower:', error);
      return res.status(500).json({ error: error.message || 'Failed to create custom manpower.' });
    }
  }

  static updateCustomManpower(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;
      const { name, members, is_active } = req.body;

      const existing = db.prepare('SELECT * FROM custom_manpower WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ error: `Custom manpower with ID '${id}' not found.` });
      }

      const user = req.user;
      const isMasterAdmin = user.isAdmin || user.role === 'AKR' || user.role === 'CKG';
      if (!isMasterAdmin && user.role !== existing.area) {
        return res.status(403).json({
          error: `Permission denied. User with role '${user.role}' cannot modify custom manpower for area '${existing.area}'.`
        });
      }

      const updatedName = (name !== undefined && name.trim()) ? name.trim() : existing.name;
      const updatedMembers = members !== undefined ? (members ? members.trim() : null) : existing.members;
      const updatedActive = (is_active !== undefined) ? (is_active ? 1 : 0) : existing.is_active;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE custom_manpower
        SET name = ?, members = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(updatedName, updatedMembers, updatedActive, now, id);

      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'log_' + crypto.randomUUID(),
        now,
        user.id,
        user.username,
        'UPDATE_CUSTOM_MANPOWER',
        'CUSTOM_MANPOWER',
        id,
        `Updated custom manpower ${id} (${existing.name} -> ${updatedName}, active=${updatedActive})`
      );

      const updated = db.prepare('SELECT * FROM custom_manpower WHERE id = ?').get(id);
      return res.json({
        message: 'Custom manpower updated successfully.',
        data: updated
      });
    } catch (error) {
      console.error('Error updating custom manpower:', error);
      return res.status(500).json({ error: error.message || 'Failed to update custom manpower.' });
    }
  }

  static deleteCustomManpower(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;

      const user = req.user;
      const isMasterAdmin = user.isAdmin || user.role === 'AKR' || user.role === 'CKG';
      if (!isMasterAdmin) {
        return res.status(403).json({ error: 'Only Master Administrators (AKR or CKG) can delete custom manpower records.' });
      }

      const existing = db.prepare('SELECT * FROM custom_manpower WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ error: `Custom manpower with ID '${id}' not found.` });
      }

      db.prepare('DELETE FROM custom_manpower WHERE id = ?').run(id);

      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'log_' + crypto.randomUUID(),
        new Date().toISOString(),
        user.id,
        user.username,
        'DELETE_CUSTOM_MANPOWER',
        'CUSTOM_MANPOWER',
        id,
        `Permanently deleted custom manpower ${id} (${existing.name}) from ${existing.area}`
      );

      return res.json({ message: `Custom manpower '${existing.name}' permanently deleted.` });
    } catch (error) {
      console.error('Error deleting custom manpower:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete custom manpower.' });
    }
  }
}
