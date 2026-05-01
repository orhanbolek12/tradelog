const express = require('express');
const router = express.Router();
const { db } = require('../database');

// ── STRATEGIES ──

// GET all strategies
router.get('/strategies', async (req, res) => {
  try {
    const rows = await db.queryAll('SELECT * FROM strategies ORDER BY name ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add strategy
router.post('/strategies', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name required' });
    const result = await db.queryRun('INSERT INTO strategies (name) VALUES (?)', [name.trim()]);
    const row = await db.queryGet('SELECT * FROM strategies WHERE id = ?', [result.lastInsertRowid]);
    res.json({ success: true, data: row });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique constraint')) return res.status(400).json({ success: false, error: 'Strategy already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE strategy
router.delete('/strategies/:id', async (req, res) => {
  try {
    await db.queryRun('DELETE FROM strategies WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT rename strategy
router.put('/strategies/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name required' });
    await db.queryRun('UPDATE strategies SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique constraint')) return res.status(400).json({ success: false, error: 'Strategy already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── CATEGORIES ──

// GET all categories
router.get('/categories', async (req, res) => {
  try {
    const rows = await db.queryAll('SELECT * FROM categories ORDER BY name ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add category
router.post('/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name required' });
    const result = await db.queryRun('INSERT INTO categories (name) VALUES (?)', [name.trim()]);
    const row = await db.queryGet('SELECT * FROM categories WHERE id = ?', [result.lastInsertRowid]);
    res.json({ success: true, data: row });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique constraint')) return res.status(400).json({ success: false, error: 'Category already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE category
router.delete('/categories/:id', async (req, res) => {
  try {
    await db.queryRun('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT rename category
router.put('/categories/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name required' });
    await db.queryRun('UPDATE categories SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique constraint')) return res.status(400).json({ success: false, error: 'Category already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
