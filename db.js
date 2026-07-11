const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_number TEXT UNIQUE NOT NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT,
  receiver_name TEXT NOT NULL,
  receiver_email TEXT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  weight REAL,
  service TEXT,
  eta TEXT,
  status TEXT NOT NULL DEFAULT 'Registered',
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  status TEXT NOT NULL,
  location TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL,
  from_email TEXT,
  to_email TEXT,
  subject TEXT,
  body TEXT,
  related_tracking TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
`);

module.exports = db;
