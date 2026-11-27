import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded from server root or workspace root deterministically
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // Fallback to process cwd

const DEFAULT_DEV_SECRET = 'bhel_secure_session_secret_change_in_production';

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = parseInt(process.env.PORT || '5000', 10);
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
export const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../../server/data/bhel_portal.sqlite');

let secret = process.env.JWT_SECRET;
if (!secret) {
  if (NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET must be set in production environment.');
  }
  secret = DEFAULT_DEV_SECRET;
} else if (NODE_ENV === 'production' && secret === DEFAULT_DEV_SECRET) {
  throw new Error('FATAL: Insecure default JWT_SECRET cannot be used in production.');
}

export const JWT_SECRET = secret;

export const config = {
  NODE_ENV,
  PORT,
  CLIENT_ORIGIN,
  DB_PATH,
  JWT_SECRET
};

export default config;
