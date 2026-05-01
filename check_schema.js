const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'tradelog.db');
const db = new Database(dbPath);
const info = db.prepare("PRAGMA table_info(trades)").all();
console.log(JSON.stringify(info, null, 2));
db.close();
