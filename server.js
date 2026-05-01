const express = require('express');
const path = require('path');
const cors = require('cors');

const profileRoutes = require('./routes/profiles').router;
const tradeRoutes = require('./routes/trades');
const lookupRoutes = require('./routes/lookup');

const app = express();
const PORT = 5003;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/profiles', profileRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/lookup', lookupRoutes);

// SPA fallback
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║  TradeLog Dashboard                      ║`);
    console.log(`  ║  Running at http://localhost:${PORT}        ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
  });
}

module.exports = app;
