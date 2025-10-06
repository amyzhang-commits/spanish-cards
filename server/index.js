import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 8000;

// Initialize Postgres connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create tables if they don't exist
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        card_type TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        deleted INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_device_id ON cards(device_id);
      CREATE INDEX IF NOT EXISTS idx_updated_at ON cards(updated_at);
      CREATE INDEX IF NOT EXISTS idx_deleted ON cards(deleted);
    `);
    console.log('✅ Database initialized');
  } finally {
    client.release();
  }
}

initDatabase().catch(console.error);

// Middleware - Allow all origins for now
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Handle preflight requests explicitly
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));

// Root route for Railway health checks
app.get('/', (req, res) => {
  res.json({ 
    message: 'Spanish Cards Sync Server',
    status: 'running',
    endpoints: {
      health: '/health',
      uploadCards: 'POST /api/cards',
      downloadCards: 'GET /api/cards/:device_id',
      stats: '/api/stats'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Upload cards from device
app.post('/api/cards', async (req, res) => {
  const client = await pool.connect();
  try {
    const { cards, device_id } = req.body;

    if (!cards || !Array.isArray(cards) || !device_id) {
      return res.status(400).json({ error: 'Invalid request: cards array and device_id required' });
    }

    await client.query('BEGIN');

    for (const card of cards) {
      await client.query(
        `INSERT INTO cards (id, device_id, card_type, data, created_at, updated_at, deleted)
         VALUES ($1, $2, $3, $4, $5, $6, 0)
         ON CONFLICT (id) DO UPDATE SET
           data = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at`,
        [
          card.id,
          device_id,
          card.type,
          JSON.stringify(card),
          card.created_at || Date.now(),
          Date.now()
        ]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      uploaded: cards.length,
      timestamp: Date.now()
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Download cards for device (only cards modified after last sync)
app.get('/api/cards/:device_id', async (req, res) => {
  try {
    const { device_id } = req.params;
    const { since } = req.query; // Timestamp of last sync

    const sinceTimestamp = since ? parseInt(since) : 0;

    // Get all cards updated after 'since', excluding cards from this device
    const result = await pool.query(
      `SELECT data FROM cards
       WHERE updated_at > $1
         AND device_id != $2
         AND deleted = 0
       ORDER BY updated_at ASC`,
      [sinceTimestamp, device_id]
    );

    const cards = result.rows.map(row =>
      typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    );

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
app.get('/api/stats', async (req, res) => {
  try {
    const cardsResult = await pool.query('SELECT COUNT(*) as count FROM cards WHERE deleted = 0');
    const devicesResult = await pool.query('SELECT COUNT(DISTINCT device_id) as count FROM cards');

    res.json({
      total_cards: parseInt(cardsResult.rows[0].count),
      total_devices: parseInt(devicesResult.rows[0].count),
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server - IMPORTANT: listen on 0.0.0.0 and Railway's PORT
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Spanish Cards Sync Server running on port ${PORT}`);
  console.log(`📊 Database: Postgres`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
