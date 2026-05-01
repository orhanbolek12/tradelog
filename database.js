const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const usePostgres = !!process.env.POSTGRES_URL;

let pool;
let sqliteDb;

if (usePostgres) {
  pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  const DB_PATH = path.join(__dirname, 'data', 'tradelog.db');
  if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  }
  sqliteDb = new Database(DB_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
}

const db = {
  async queryAll(sql, params = []) {
    if (usePostgres) {
      let i = 1;
      const pgSql = sql.replace(/\?/g, () => `$${i++}`);
      const res = await pool.query(pgSql, params);
      return res.rows;
    } else {
      return sqliteDb.prepare(sql).all(...params);
    }
  },
  async queryGet(sql, params = []) {
    if (usePostgres) {
      let i = 1;
      const pgSql = sql.replace(/\?/g, () => `$${i++}`);
      const res = await pool.query(pgSql, params);
      return res.rows[0];
    } else {
      return sqliteDb.prepare(sql).get(...params);
    }
  },
  async queryRun(sql, params = []) {
    if (usePostgres) {
      let i = 1;
      let pgSql = sql.replace(/\?/g, () => `$${i++}`);
      if (pgSql.trim().toUpperCase().startsWith('INSERT')) {
         pgSql += ' RETURNING id';
      }
      const res = await pool.query(pgSql, params);
      return { lastInsertRowid: res.rows.length > 0 ? res.rows[0].id : null };
    } else {
      const info = sqliteDb.prepare(sql).run(...params);
      return { lastInsertRowid: info.lastInsertRowid };
    }
  }
};

// Initialize schema
async function initDb() {
  if (usePostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        avatar_initials TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        bio TEXT DEFAULT '',
        default_market TEXT DEFAULT 'Stocks',
        risk_unit_value REAL DEFAULT 100,
        password TEXT,
        password_plain TEXT
      );

      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('Long', 'Short')),
        market TEXT NOT NULL DEFAULT 'Stocks',
        strategy TEXT DEFAULT 'Manual',
        category TEXT DEFAULT '',
        entry_date TEXT NOT NULL,
        exit_date TEXT,
        entry_price REAL NOT NULL,
        exit_price REAL,
        quantity REAL NOT NULL,
        stop_loss REAL,
        take_profit REAL,
        pnl REAL,
        pnl_pct REAL,
        rr_ratio REAL,
        is_risk_unit_mode INTEGER DEFAULT 0,
        risk_amount_r REAL,
        commission REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open', 'Closed', 'Cancelled')),
        emotional_state TEXT DEFAULT 'Calm',
        notes TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        setup_quality INTEGER DEFAULT 3 CHECK(setup_quality BETWEEN 1 AND 5),
        execution_quality INTEGER DEFAULT 3 CHECK(execution_quality BETWEEN 1 AND 5),
        tradingview_url TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS strategies (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const stratCount = parseInt((await pool.query('SELECT COUNT(*) as c FROM strategies')).rows[0].c);
    if (stratCount === 0) {
      const defaults = ['Manual','Momentum','Reversal','Breakout','Swing','Scalp','Trend Following','Mean Reversion'];
      for (const n of defaults) {
        await pool.query('INSERT INTO strategies (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [n]);
      }
    }
  } else {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        avatar_initials TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        bio TEXT DEFAULT '',
        default_market TEXT DEFAULT 'Stocks',
        risk_unit_value REAL DEFAULT 100
      );

      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('Long', 'Short')),
        market TEXT NOT NULL DEFAULT 'Stocks',
        strategy TEXT DEFAULT 'Manual',
        entry_date TEXT NOT NULL,
        exit_date TEXT,
        entry_price REAL NOT NULL,
        exit_price REAL,
        quantity REAL NOT NULL,
        stop_loss REAL,
        take_profit REAL,
        pnl REAL,
        pnl_pct REAL,
        commission REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open', 'Closed', 'Cancelled')),
        emotional_state TEXT DEFAULT 'Calm',
        notes TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        setup_quality INTEGER DEFAULT 3 CHECK(setup_quality BETWEEN 1 AND 5),
        execution_quality INTEGER DEFAULT 3 CHECK(execution_quality BETWEEN 1 AND 5),
        rr_ratio REAL,
        is_risk_unit_mode INTEGER DEFAULT 0,
        risk_amount_r REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // SQLite Migrations
    const tradeColumns = sqliteDb.prepare("PRAGMA table_info(trades)").all().map(c => c.name);
    if (!tradeColumns.includes('tradingview_url')) sqliteDb.exec("ALTER TABLE trades ADD COLUMN tradingview_url TEXT DEFAULT ''");
    if (!tradeColumns.includes('category')) sqliteDb.exec("ALTER TABLE trades ADD COLUMN category TEXT DEFAULT ''");
    if (!tradeColumns.includes('rr_ratio')) sqliteDb.exec("ALTER TABLE trades ADD COLUMN rr_ratio REAL");
    if (!tradeColumns.includes('is_risk_unit_mode')) sqliteDb.exec("ALTER TABLE trades ADD COLUMN is_risk_unit_mode INTEGER DEFAULT 0");
    if (!tradeColumns.includes('risk_amount_r')) sqliteDb.exec("ALTER TABLE trades ADD COLUMN risk_amount_r REAL");

    const profileColumns = sqliteDb.prepare("PRAGMA table_info(profiles)").all().map(c => c.name);
    if (!profileColumns.includes('risk_unit_value')) sqliteDb.exec("ALTER TABLE profiles ADD COLUMN risk_unit_value REAL DEFAULT 100");
    if (!profileColumns.includes('password')) sqliteDb.exec("ALTER TABLE profiles ADD COLUMN password TEXT");
    if (!profileColumns.includes('password_plain')) sqliteDb.exec("ALTER TABLE profiles ADD COLUMN password_plain TEXT");

    const stratCount = sqliteDb.prepare('SELECT COUNT(*) as c FROM strategies').get().c;
    if (stratCount === 0) {
      const defaults = ['Manual','Momentum','Reversal','Breakout','Swing','Scalp','Trend Following','Mean Reversion'];
      const ins = sqliteDb.prepare('INSERT OR IGNORE INTO strategies (name) VALUES (?)');
      defaults.forEach(n => ins.run(n));
    }
  }
}

// Call init immediately (in a real production app you might await this before starting the server)
initDb().catch(console.error);

// Helper: calculate P&L
function calcPnL(direction, entryPrice, exitPrice, quantity, commission = 0) {
  if (!exitPrice) return { pnl: null, pnl_pct: null };
  let raw;
  if (direction === 'Long') {
    raw = (exitPrice - entryPrice) * quantity;
  } else {
    raw = (entryPrice - exitPrice) * quantity;
  }
  const pnl = raw - commission;
  const pnl_pct = ((exitPrice - entryPrice) / entryPrice) * 100 * (direction === 'Short' ? -1 : 1);
  return { pnl, pnl_pct };
}

function calcRR(direction, entryPrice, stopLoss, takeProfit, exitPrice) {
  if (!entryPrice || !stopLoss) return null;
  const target = exitPrice || takeProfit;
  if (!target) return null;
  
  const risk = Math.abs(entryPrice - stopLoss);
  if (risk === 0) return 0;
  
  const diff = direction === 'Short' ? (entryPrice - target) : (target - entryPrice);
  return diff / risk;
}

module.exports = { db, calcPnL, calcRR };
