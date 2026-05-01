const { db, calcRR } = require('./database');

const trades = db.prepare("SELECT * FROM trades").all();
const update = db.prepare("UPDATE trades SET rr_ratio = ? WHERE id = ?");

let count = 0;
for (const t of trades) {
  const rr = calcRR(t.entry_price, t.stop_loss, t.take_profit, t.exit_price);
  if (rr !== null) {
    update.run(rr, t.id);
    count++;
  }
}

console.log(`Updated RR for ${count} trades.`);
db.close();
