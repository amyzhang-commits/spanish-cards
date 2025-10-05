import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Initialize SQLite database
const db = new Database(join(__dirname, 'cards.db'));

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    card_type TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_device_id ON cards(device_id);
  CREATE INDEX IF NOT EXISTS idx_updated_at ON cards(updated_at);
  CREATE INDEX IF NOT EXISTS idx_deleted ON cards(deleted);
`);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Upload cards from device
app.post('/api/cards', (req, res) => {
  try {
    const { cards, device_id } = req.body;

    if (!cards || !Array.isArray(cards) || !device_id) {
      return res.status(400).json({ error: 'Invalid request: cards array and device_id required' });
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO cards (id, device_id, card_type, data, created_at, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `);

    const insertMany = db.transaction((cardsToInsert) => {
      for (const card of cardsToInsert) {
        stmt.run(
          card.id,
          device_id,
          card.type,
          JSON.stringify(card),
          card.created_at || Date.now(),
          Date.now()
        );
      }
    });

    insertMany(cards);

    res.json({
      success: true,
      uploaded: cards.length,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download cards for device (only cards modified after last sync)
app.get('/api/cards/:device_id', (req, res) => {
  try {
    const { device_id } = req.params;
    const { since } = req.query; // Timestamp of last sync

    const sinceTimestamp = since ? parseInt(since) : 0;

    // Get all cards updated after 'since', excluding cards from this device
    const stmt = db.prepare(`
      SELECT data FROM cards
      WHERE updated_at > ?
        AND device_id != ?
        AND deleted = 0
      ORDER BY updated_at ASC
    `);

    const rows = stmt.all(sinceTimestamp, device_id);
    const cards = rows.map(row => JSON.parse(row.data));

    res.json({
      success: true,
      cards: cards,
      count: cards.length,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get sync stats
app.get('/api/stats', (req, res) => {
  try {
    const totalCards = db.prepare('SELECT COUNT(*) as count FROM cards WHERE deleted = 0').get();
    const totalDevices = db.prepare('SELECT COUNT(DISTINCT device_id) as count FROM cards').get();

    res.json({
      total_cards: totalCards.count,
      total_devices: totalDevices.count,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Spanish Cards Sync Server running on port ${PORT}`);
  console.log(`📊 Database: ${join(__dirname, 'cards.db')}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
