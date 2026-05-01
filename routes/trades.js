const express = require('express');
const router = express.Router();
const { db, calcPnL, calcRR } = require('../database');
const { verifyAuth } = require('./profiles');

// GET all trades for a profile
router.get('/profile/:profileId', async (req, res) => {
  try {
    const { status, market, strategy, sort, order, limit, offset } = req.query;
    let sql = 'SELECT * FROM trades WHERE profile_id = ?';
    const params = [req.params.profileId];

    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (market) { sql += ' AND market = ?'; params.push(market); }
    if (strategy) { sql += ' AND strategy = ?'; params.push(strategy); }

    const sortCol = sort || 'entry_date';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortCol} ${sortOrder}`;

    if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
    if (offset) { sql += ' OFFSET ?'; params.push(parseInt(offset)); }

    const trades = await db.queryAll(sql, params);
    res.json({ success: true, data: trades });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET stats for a profile
router.get('/stats/:profileId', async (req, res) => {
  try {
    const pid = req.params.profileId;

    const closedTrades = await db.queryAll(`
      SELECT * FROM trades WHERE profile_id = ? AND status = 'Closed' ORDER BY exit_date ASC
    `, [pid]);

    const openTrades = await db.queryAll(`
      SELECT * FROM trades WHERE profile_id = ? AND status = 'Open' ORDER BY entry_date DESC
    `, [pid]);

    const totalTrades = closedTrades.length + openTrades.length;
    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl <= 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
    const totalPnL = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : (wins.length > 0 ? Infinity : 0);
    const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0;
    
    // Calculate Total RR and Average RR
    let totalRR = 0;
    let rrCount = 0;
    let rrSum = 0;
    
    closedTrades.forEach(t => {
      if (t.rr_ratio != null) {
        const rMult = t.is_risk_unit_mode ? (t.risk_amount_r || 1) : 1;
        totalRR += (t.rr_ratio * rMult);
        rrSum += t.rr_ratio;
        rrCount++;
      }
    });
    const avgRR = rrCount > 0 ? rrSum / rrCount : 0;

    // Streak calculation
    let currentStreak = 0;
    let bestWinStreak = 0;
    let bestLossStreak = 0;
    let tempStreak = 0;
    let lastType = null;

    for (const t of closedTrades) {
      const type = t.pnl > 0 ? 'win' : 'loss';
      if (type === lastType) {
        tempStreak++;
      } else {
        tempStreak = 1;
        lastType = type;
      }
      if (type === 'win') bestWinStreak = Math.max(bestWinStreak, tempStreak);
      else bestLossStreak = Math.max(bestLossStreak, tempStreak);
    }
    if (lastType === 'win') currentStreak = tempStreak;
    else currentStreak = -tempStreak;

    // Equity curve
    let equity = 0;
    const equityCurve = closedTrades.map(t => {
      equity += (t.pnl || 0);
      return { date: t.exit_date, equity, pnl: t.pnl };
    });

    // Strategy performance
    const strategyMap = {};
    closedTrades.forEach(t => {
      const s = t.strategy || 'Manual';
      if (!strategyMap[s]) strategyMap[s] = { name: s, trades: 0, wins: 0, pnl: 0 };
      strategyMap[s].trades++;
      if (t.pnl > 0) strategyMap[s].wins++;
      strategyMap[s].pnl += (t.pnl || 0);
    });
    const strategyPerf = Object.values(strategyMap);

    // Daily PnL
    const dailyPnL = {};
    closedTrades.forEach(t => {
      const d = t.exit_date ? t.exit_date.split('T')[0] : null;
      if (d) {
        dailyPnL[d] = (dailyPnL[d] || 0) + (t.pnl || 0);
      }
    });

    // Monthly performance
    const monthlyPnL = {};
    closedTrades.forEach(t => {
      const d = t.exit_date ? t.exit_date.substring(0, 7) : null;
      if (d) {
        monthlyPnL[d] = (monthlyPnL[d] || 0) + (t.pnl || 0);
      }
    });

    // Long vs Short
    const longTrades = closedTrades.filter(t => t.direction === 'Long');
    const shortTrades = closedTrades.filter(t => t.direction === 'Short');
    const longPnL = longTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const shortPnL = shortTrades.reduce((s, t) => s + (t.pnl || 0), 0);

    // Market breakdown
    const marketMap = {};
    closedTrades.forEach(t => {
      const m = t.market || 'Stocks';
      if (!marketMap[m]) marketMap[m] = { name: m, trades: 0, pnl: 0 };
      marketMap[m].trades++;
      marketMap[m].pnl += (t.pnl || 0);
    });

    res.json({
      success: true,
      data: {
        totalTrades, closedCount: closedTrades.length, openCount: openTrades.length,
        winRate, totalPnL, avgWin, avgLoss, profitFactor, largestWin, largestLoss,
        totalRR, avgRR, currentStreak, bestWinStreak, bestLossStreak,
        equityCurve, strategyPerf, dailyPnL, monthlyPnL,
        longShort: { long: { count: longTrades.length, pnl: longPnL }, short: { count: shortTrades.length, pnl: shortPnL } },
        marketBreakdown: Object.values(marketMap),
        openTrades
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single trade
router.get('/:id', async (req, res) => {
  try {
    const trade = await db.queryGet('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    if (!trade) return res.status(404).json({ success: false, error: 'Trade not found' });
    res.json({ success: true, data: trade });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create trade
router.post('/', async (req, res) => {
  try {
    const { profile_id } = req.body;
    const isAuth = await verifyAuth(req, profile_id);
    if (!isAuth) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const {
      symbol, direction, market, strategy, category,
      entry_date, exit_date, entry_price, exit_price,
      quantity, stop_loss, take_profit, commission,
      status, emotional_state, notes, tags,
      setup_quality, execution_quality, tradingview_url,
      is_risk_unit_mode, risk_amount_r
    } = req.body;

    if (!profile_id || !symbol || !direction || !entry_date || !entry_price || (!is_risk_unit_mode && !quantity)) {
      return res.status(400).json({ success: false, error: 'Required fields: profile_id, symbol, direction, entry_date, entry_price, quantity/R' });
    }

    const tradeStatus = exit_price ? (status || 'Closed') : (status || 'Open');
    const entryNum = parseFloat(entry_price);
    const exitNum = exit_price ? parseFloat(exit_price) : null;
    const qtyNum = parseFloat(quantity || 0);
    const commNum = parseFloat(commission || 0);

    const rr_ratio = calcRR(direction, entryNum, stop_loss ? parseFloat(stop_loss) : null, take_profit ? parseFloat(take_profit) : null, exitNum);

    let pnl, pnl_pct;
    if (is_risk_unit_mode && risk_amount_r) {
      const profile = await db.queryGet('SELECT risk_unit_value FROM profiles WHERE id = ?', [profile_id]);
      const rValue = profile ? profile.risk_unit_value : 100;
      pnl = exitNum ? (rr_ratio * parseFloat(risk_amount_r) * rValue) - commNum : null;
      pnl_pct = exitNum ? ((exitNum - entryNum) / entryNum) * 100 * (direction === 'Short' ? -1 : 1) : null;
    } else {
      const resPnL = calcPnL(direction, entryNum, exitNum, qtyNum, commNum);
      pnl = resPnL.pnl;
      pnl_pct = resPnL.pnl_pct;
    }

    const result = await db.queryRun(`
      INSERT INTO trades (profile_id, symbol, direction, market, strategy, category,
        entry_date, exit_date, entry_price, exit_price, quantity,
        stop_loss, take_profit, pnl, pnl_pct, rr_ratio, is_risk_unit_mode, risk_amount_r, commission, status,
        emotional_state, notes, tags, setup_quality, execution_quality, tradingview_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      profile_id, symbol.toUpperCase(), direction, market || 'Stocks', strategy || 'Manual', category || '',
      entry_date, exit_date || null, entryNum, exitNum, qtyNum,
      stop_loss ? parseFloat(stop_loss) : null, take_profit ? parseFloat(take_profit) : null,
      pnl, pnl_pct, rr_ratio, is_risk_unit_mode ? 1 : 0, risk_amount_r ? parseFloat(risk_amount_r) : null, commNum, tradeStatus,
      emotional_state || 'Calm', notes || '', tags || '',
      parseInt(setup_quality || 3), parseInt(execution_quality || 3), tradingview_url || ''
    ]);

    const trade = await db.queryGet('SELECT * FROM trades WHERE id = ?', [result.lastInsertRowid]);
    res.json({ success: true, data: trade });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update trade
router.put('/:id', async (req, res) => {
  try {
    const existing = await db.queryGet('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Trade not found' });

    const isAuth = await verifyAuth(req, existing.profile_id);
    if (!isAuth) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const {
      symbol, direction, market, strategy, category,
      entry_date, exit_date, entry_price, exit_price,
      quantity, stop_loss, take_profit, commission,
      status, emotional_state, notes, tags,
      setup_quality, execution_quality, tradingview_url,
      is_risk_unit_mode, risk_amount_r
    } = req.body;

    const finalDirection = direction || existing.direction;
    const finalEntryPrice = entry_price ? parseFloat(entry_price) : existing.entry_price;
    const finalExitPrice = exit_price !== undefined ? (exit_price ? parseFloat(exit_price) : null) : existing.exit_price;
    const finalQuantity = quantity !== undefined ? parseFloat(quantity) : existing.quantity;
    const finalCommission = commission !== undefined ? parseFloat(commission) : existing.commission;
    const finalStatus = finalExitPrice ? (status || 'Closed') : (status || 'Open');
    
    const finalStopLoss = stop_loss !== undefined ? (stop_loss ? parseFloat(stop_loss) : null) : existing.stop_loss;
    const finalTakeProfit = take_profit !== undefined ? (take_profit ? parseFloat(take_profit) : null) : existing.take_profit;
    const rr_ratio = calcRR(finalDirection, finalEntryPrice, finalStopLoss, finalTakeProfit, finalExitPrice);

    let pnl, pnl_pct;
    const mode = is_risk_unit_mode !== undefined ? is_risk_unit_mode : existing.is_risk_unit_mode;
    const rAmt = risk_amount_r !== undefined ? risk_amount_r : existing.risk_amount_r;

    if (mode && rAmt) {
      const profile = await db.queryGet('SELECT risk_unit_value FROM profiles WHERE id = ?', [existing.profile_id]);
      const rValue = profile ? profile.risk_unit_value : 100;
      pnl = finalExitPrice ? (rr_ratio * parseFloat(rAmt) * rValue) - finalCommission : null;
      pnl_pct = finalExitPrice ? ((finalExitPrice - finalEntryPrice) / finalEntryPrice) * 100 * (finalDirection === 'Short' ? -1 : 1) : null;
    } else {
      const resPnL = calcPnL(finalDirection, finalEntryPrice, finalExitPrice, finalQuantity, finalCommission);
      pnl = resPnL.pnl;
      pnl_pct = resPnL.pnl_pct;
    }

    // SQLite uses datetime('now'), Postgres uses CURRENT_TIMESTAMP. Since we use `updated_at` column we should pass it from JS or omit and let DB handle if trigger exists, or use CURRENT_TIMESTAMP in SQL directly.
    // However, sqlite doesn't like CURRENT_TIMESTAMP in UPDATE sometimes without specific syntax, but actually it's fine if we just pass a JS date string.
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await db.queryRun(`
      UPDATE trades SET
        symbol=?, direction=?, market=?, strategy=?, category=?,
        entry_date=?, exit_date=?, entry_price=?, exit_price=?,
        quantity=?, stop_loss=?, take_profit=?, pnl=?, pnl_pct=?, rr_ratio=?,
        is_risk_unit_mode=?, risk_amount_r=?,
        commission=?, status=?, emotional_state=?, notes=?, tags=?,
        setup_quality=?, execution_quality=?, tradingview_url=?, updated_at=?
      WHERE id=?
    `, [
      symbol ? symbol.toUpperCase() : existing.symbol, finalDirection, market || existing.market,
      strategy !== undefined ? strategy : existing.strategy, category !== undefined ? category : existing.category,
      entry_date || existing.entry_date, exit_date !== undefined ? (exit_date || null) : existing.exit_date,
      finalEntryPrice, finalExitPrice, finalQuantity, finalStopLoss, finalTakeProfit, pnl, pnl_pct, rr_ratio,
      mode ? 1 : 0, rAmt ? parseFloat(rAmt) : null,
      finalCommission, finalStatus, emotional_state || existing.emotional_state,
      notes !== undefined ? notes : existing.notes, tags !== undefined ? tags : existing.tags,
      setup_quality ? parseInt(setup_quality) : existing.setup_quality, execution_quality ? parseInt(execution_quality) : existing.execution_quality,
      tradingview_url !== undefined ? tradingview_url : existing.tradingview_url,
      now, req.params.id
    ]);

    const trade = await db.queryGet('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: trade });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE trade
router.delete('/:id', async (req, res) => {
  try {
    const existing = await db.queryGet('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Trade not found' });
    
    const isAuth = await verifyAuth(req, existing.profile_id);
    if (!isAuth) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    await db.queryRun('DELETE FROM trades WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Trade deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

