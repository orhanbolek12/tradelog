const { db, calcPnL, calcRR } = require('./database');

const profile_id = 1;
const symbol = 'MANUAL';
const direction = 'Short';
const entry_price = 3.70;
const stop_loss = 4.04;
const exit_price = 3.30;
const quantity = 100;
const commission = 0;

const { pnl, pnl_pct } = calcPnL(direction, entry_price, exit_price, quantity, commission);
const rr_ratio = calcRR(entry_price, stop_loss, null, exit_price);

console.log('Calculated RR:', rr_ratio);

const result = db.prepare(`
  INSERT INTO trades (profile_id, symbol, direction, entry_date, entry_price, exit_price, quantity, stop_loss, pnl, pnl_pct, rr_ratio, status)
  VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, 'Closed')
`).run(profile_id, symbol, direction, entry_price, exit_price, quantity, stop_loss, pnl, pnl_pct, rr_ratio);

console.log('Insert result:', result);

const saved = db.prepare("SELECT * FROM trades WHERE id = ?").get(result.lastInsertRowid);
console.log('Saved trade RR:', saved.rr_ratio);
db.close();
