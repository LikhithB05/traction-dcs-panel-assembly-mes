import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from './config/env.js';
import apiRouter from './routes/api.js';
import { initDatabase } from './db/database.js';
import { seedDatabase } from './db/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

const app = express();
const PORT = config.PORT || 5000;

// Middleware
const isProduction = config.NODE_ENV === 'production';
const allowedOrigins = [
  config.CLIENT_ORIGIN,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
].filter(Boolean);

const corsOptionsDelegate = (req, callback) => {
  const origin = req.header('Origin');
  if (!origin) {
    return callback(null, { origin: true, credentials: true });
  }
  const host = req.get('host');
  const isSameHost = origin === `http://${host}` || origin === `https://${host}`;
  if (!isProduction || isSameHost || allowedOrigins.includes(origin)) {
    return callback(null, { origin: true, credentials: true });
  }
  return callback(new Error(`Origin '${origin}' not permitted by CORS policy.`));
};

app.use(cors(corsOptionsDelegate));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'BHEL Traction & DCS Panel Assembly Management Portal',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api', apiRouter);

// Serve static frontend assets if built
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (config.NODE_ENV === 'production') {
    res.status(500).json({ error: 'An unexpected internal server error occurred.' });
  } else {
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// Server Initialization
export async function startServer(port = PORT, customDbPath = null) {
  const db = initDatabase(customDbPath);
  await seedDatabase(db);

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`BHEL Portal Server running at http://localhost:${port}`);
      resolve({ app, server, db });
    });
  });
}

// Start if run directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
