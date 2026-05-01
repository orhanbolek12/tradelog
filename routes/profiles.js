const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Asdasdwasd12!';

// Helper to verify profile password
async function verifyAuth(req, profileId) {
  const password = req.headers['x-profile-password'];
  if (!password) return false;
  
  // Superuser check
  if (password === ADMIN_PASS) return true;
  
  const profile = await db.queryGet('SELECT password FROM profiles WHERE id = ?', [profileId]);
  if (!profile || !profile.password) return true; // Legacy
  
  return bcrypt.compareSync(password, profile.password);
}

// GET all profiles
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.headers['x-profile-password'] === ADMIN_PASS;
    const pwdCol = isAdmin ? ', p.password_plain' : '';
    
    const profiles = await db.queryAll(`
      SELECT p.id, p.name, p.color, p.avatar_initials, p.created_at, p.bio, p.default_market, p.risk_unit_value ${pwdCol},
        COUNT(DISTINCT t.id) as total_trades,
        SUM(CASE WHEN t.status = 'Closed' AND t.pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(CASE WHEN t.status = 'Closed' THEN t.pnl ELSE 0 END) as total_pnl,
        SUM(CASE WHEN t.status = 'Closed' THEN 1 ELSE 0 END) as closed_trades,
        SUM(CASE WHEN t.status = 'Closed' AND t.rr_ratio IS NOT NULL 
            THEN t.rr_ratio * (CASE WHEN t.is_risk_unit_mode = 1 THEN COALESCE(t.risk_amount_r, 1) ELSE 1 END)
            ELSE 0 END) as total_r
      FROM profiles p
      LEFT JOIN trades t ON t.profile_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, data: profiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single profile
router.get('/:id', async (req, res) => {
  try {
    const isAdmin = req.headers['x-profile-password'] === ADMIN_PASS;
    const pwdCol = isAdmin ? ', password_plain' : '';
    const profile = await db.queryGet(`SELECT id, name, color, avatar_initials, created_at, bio, default_market, risk_unit_value ${pwdCol} FROM profiles WHERE id = ?`, [req.params.id]);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST login
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    
    // Admin login
    if (name === ADMIN_USER && password === ADMIN_PASS) {
      return res.json({ success: true, data: { id: 0, name: 'Admin', isAdmin: true } });
    }
    
    const profile = await db.queryGet('SELECT * FROM profiles WHERE name = ?', [name]);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    
    if (profile.password && !bcrypt.compareSync(password, profile.password)) {
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    const { password: _, password_plain: __, ...safeProfile } = profile;
    res.json({ success: true, data: safeProfile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create profile
router.post('/', async (req, res) => {
  try {
    const { name, color, bio, default_market, risk_unit_value, password } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password is required (min 4 chars)' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const initials = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    
    const result = await db.queryRun(`
      INSERT INTO profiles (name, color, avatar_initials, bio, default_market, risk_unit_value, password, password_plain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [name.trim(), color || '#3b82f6', initials, bio || '', default_market || 'Stocks', parseFloat(risk_unit_value || 100), hashedPassword, password]);
    
    const profile = await db.queryGet('SELECT id, name, color, avatar_initials, created_at, bio, default_market, risk_unit_value FROM profiles WHERE id = ?', [result.lastInsertRowid]);
    res.json({ success: true, data: profile });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique constraint')) {
      return res.status(400).json({ success: false, error: 'Profile name already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update profile
router.put('/:id', async (req, res) => {
  try {
    const isAuth = await verifyAuth(req, req.params.id);
    if (!isAuth) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { name, color, bio, default_market, risk_unit_value, password } = req.body;
    const existing = await db.queryGet('SELECT * FROM profiles WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Profile not found' });
    
    const newName = name?.trim() || existing.name;
    const initials = newName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    
    // Admin can update password
    let pwdUpdate = '';
    const pwdParams = [];
    if (password) {
      pwdUpdate = ', password=?, password_plain=?';
      pwdParams.push(bcrypt.hashSync(password, 10), password);
    }
    
    await db.queryRun(`
      UPDATE profiles SET name=?, color=?, avatar_initials=?, bio=?, default_market=?, risk_unit_value=? ${pwdUpdate} WHERE id=?
    `, [newName, color || existing.color, initials, bio ?? existing.bio, default_market || existing.default_market, risk_unit_value !== undefined ? parseFloat(risk_unit_value) : existing.risk_unit_value, ...pwdParams, req.params.id]);
    
    const profile = await db.queryGet('SELECT id, name, color, avatar_initials, created_at, bio, default_market, risk_unit_value FROM profiles WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE profile
router.delete('/:id', async (req, res) => {
  try {
    const isAuth = await verifyAuth(req, req.params.id);
    if (!isAuth) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const existing = await db.queryGet('SELECT * FROM profiles WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Profile not found' });
    await db.queryRun('DELETE FROM profiles WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Profile deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { router, verifyAuth };

