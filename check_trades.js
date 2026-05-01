const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'tradelog.db');
const db = new Database(dbPath);
const trades = db.prepare("SELECT symbol, entry_price, stop_loss, take_profit, rr_ratio FROM trades ORDER BY id DESC LIMIT 5").all();
console.log(JSON.stringify(trades, null, 2));
db.close();
